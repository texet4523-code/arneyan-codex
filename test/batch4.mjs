// 0.10.47: random art from the art packs, and numbered duplicate monsters (Kieran, 22 Oct 2026).
import assert from "node:assert/strict";
import "./harness.mjs";
const A = await import("../arneyan/module/art.mjs");
const T = await import("../arneyan/module/tokens.mjs");

// Pictures of a Goblin among a folder: its own name, numbered copies and close names; not another monster's.
const names = ["Goblin", "Goblin Boss", "Hobgoblin", "Wolf", "Dire Wolf"];
const dir = "modules/dnd-monster-manual/assets/tokens/";
const files = ["goblin.webp", "goblin-2.webp", "goblin-warrior.webp", "goblin_archer_bow.png", "goblin-boss.webp", "hobgoblin.webp", "goblin-dog.webp", "wolf.webp"].map(f => dir + f);
assert.deepEqual(A.variantFiles(files, "Goblin", names).map(p => p.split("/").pop()), ["goblin.webp", "goblin-2.webp", "goblin-warrior.webp", "goblin_archer_bow.png"]);
assert.deepEqual(A.variantFiles(files, "Wolf", names).map(p => p.split("/").pop()), ["wolf.webp"]);
// A different one each time, never the one it has.
const list = A.variantFiles(files, "Goblin", names);
for (const r of [0, 0.4, 0.99]) assert.notEqual(A.pickOther(list, dir + "goblin-warrior.webp", () => r), dir + "goblin-warrior.webp");
assert.equal(A.pickOther([dir + "wolf.webp"], dir + "wolf.webp"), null);

// Numbered duplicates: the second goblin numbers both; a third gets (3); a renamed one is left alone.
assert.equal(T.baseName("Goblin (12)"), "Goblin");
assert.equal(T.baseName("Goblin"), "Goblin");
const g = (id, name, order, base = "Goblin") => ({ id, name, order, base });
assert.deepEqual(T.duplicateNames([g("a", "Goblin", 1)]), [], "one goblin keeps its name");
assert.deepEqual(T.duplicateNames([g("a", "Goblin", 1), g("b", "Goblin", 2)]), [{ id: "a", name: "Goblin (1)" }, { id: "b", name: "Goblin (2)" }]);
assert.deepEqual(T.duplicateNames([g("a", "Goblin (1)", 1), g("b", "Goblin (2)", 2), g("c", "Goblin", 3)]), [{ id: "c", name: "Goblin (3)" }]);
assert.deepEqual(T.duplicateNames([g("a", "Goblin (1)", 1), g("c", "Goblin", 3)]), [{ id: "c", name: "Goblin (2)" }]);
assert.deepEqual(T.duplicateNames([g("a", "Snaggletooth", 1), g("b", "Goblin", 2)]), [], "a goblin the GM named isn't counted");
assert.deepEqual(T.duplicateNames([g("a", "Goblin (2)", 1), g("b", "Goblin (2)", 2)]), [{ id: "b", name: "Goblin (1)" }], "a copied token's number is sorted out");
assert.deepEqual(T.duplicateNames([g("a", "Goblin (1)", 1), g("b", "Goblin (2)", 2), g("c", "Goblin (2)", 3)]), [{ id: "c", name: "Goblin (3)" }], "a pasted Goblin (2) becomes (3)");
assert.deepEqual(T.duplicateNames([g("a", "Goblin (2)", 1), g("b", "Goblin (2)", 2), g("c", "Goblin (2)", 3)]), [{ id: "b", name: "Goblin (1)" }, { id: "c", name: "Goblin (3)" }]);
// Placed together (the same moment): the scene's order decides.
const same = (id, idx) => ({ id, name: "Goblin", order: 5, idx, base: "Goblin" });
assert.deepEqual(T.duplicateNames([same("z", 0), same("a", 1)]), [{ id: "z", name: "Goblin (1)" }, { id: "a", name: "Goblin (2)" }]);
assert.deepEqual(T.duplicateNames([g("a", "Wolf", 1, "Wolf"), g("b", "Goblin", 2), g("c", "Wolf", 3, "Wolf")]), [{ id: "a", name: "Wolf (1)" }, { id: "c", name: "Wolf (2)" }]);
// A monster not in the Bestiary list doesn't borrow another's name.
assert.deepEqual(A.variantFiles([dir + "goblin-boss.webp", dir + "snaggle.webp"], "Snaggle", names).map(p => p.split("/").pop()), ["snaggle.webp"]);
console.log("OK batch 4");

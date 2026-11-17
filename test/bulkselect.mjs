// Select and delete many actors or items at once (0.10.119, Kieran 17 Nov).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
const B = await import("../arneyan/module/bulkselect.mjs");

const docs = [
  { id: "a", name: "Fire Giant", type: "npc", folder: null },
  { id: "b", name: "Blue Dragon, Adult", type: "npc", folder: null },
  { id: "c", name: "Aria", type: "character", folder: { id: "pc", name: "Player Characters" } },
  { id: "d", name: "Wolf", type: "npc", folder: { id: "sum", name: "Summoned" } },
  { id: "e", name: "Bear", type: "npc", folder: { id: "sum", name: "Summoned" } },
  { id: "f", name: "Owl", type: "npc", folder: { id: "tr", name: "Transformed" } }
];
const g = B.bulkGroups(docs);
assert.deepEqual(g.map(x => x.name), ["Not in a folder", "Summoned", "Transformed"], "loose ones first, then folders by name; no party");
assert.deepEqual(g[0].docs.map(d => d.name), ["Blue Dragon, Adult", "Fire Giant"]);
assert.deepEqual(g[1].docs.map(d => d.id), ["e", "d"]);
assert.ok(!g.some(x => x.docs.some(d => d.type === "character")), "player characters hidden unless asked");
assert.deepEqual(B.bulkGroups(docs, { characters: true }).map(x => x.name), ["Not in a folder", "Player Characters", "Summoned", "Transformed"]);
assert.deepEqual(B.bulkGroups([]), []);
assert.equal(B.namesLine(["A", "B"]), "A, B");
assert.equal(B.namesLine(Array.from({ length: 15 }, (_, i) => `M${i}`), 12), "M0, M1, M2, M3, M4, M5, M6, M7, M8, M9, M10, M11 and 3 more");

const src = f => fs.readFileSync(new URL(`../arneyan/${f}`, import.meta.url), "utf8");
const m = src("module/bulkselect.mjs");
assert.ok(/renderActorDirectory/.test(m) && /renderItemDirectory/.test(m) && /game\.user\.isGM/.test(m));
assert.ok(/DialogV2\.confirm/.test(m) && /can't be undone/.test(m), "a confirmation before deleting");
assert.ok(/registerBulkSelect\(\)/.test(src("module/arneyan.mjs")));
assert.ok(/\.arn-bulk-list/.test(src("styles/gmtools.css")));
console.log("OK select many");

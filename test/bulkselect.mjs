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
  { id: "f", name: "Owl", type: "npc", folder: { id: "tr", name: "Transformed" } },
  { id: "g", name: "The Party", type: "party", folder: { id: "pc", name: "Player Characters" }, party: true },
  { id: "h", name: "Pony", type: "npc", folder: { id: "al", name: "Player Characters / Allies, Mounts & Pets" }, party: true },
  { id: "i", name: "Wagon", type: "storage", folder: null }
];
const g = B.bulkGroups(docs);
assert.deepEqual(g.map(x => x.name), ["Not in a folder", "Summoned", "Transformed"], "loose ones first, then folders by name; no party");
assert.deepEqual(g[0].docs.map(d => d.name), ["Blue Dragon, Adult", "Fire Giant"]);
assert.deepEqual(g[1].docs.map(d => d.id), ["e", "d"]);
assert.ok(!g.some(x => x.docs.some(d => ["c", "g", "h", "i"].includes(d.id))), "the party hidden unless asked: characters, The Party, storage, allies");
assert.deepEqual(B.bulkGroups(docs, { characters: true }).map(x => x.name), ["Not in a folder", "Player Characters", "Player Characters / Allies, Mounts & Pets", "Summoned", "Transformed"]);
assert.deepEqual([...B.PARTY_TYPES].sort(), ["character", "party", "storage"]);
assert.deepEqual(B.bulkGroups([]), []);
assert.equal(B.namesLine(["A", "B"]), "A, B");
assert.equal(B.namesLine(Array.from({ length: 15 }, (_, i) => `M${i}`), 12), "M0, M1, M2, M3, M4, M5, M6, M7, M8, M9, M10, M11 and 3 more");

const src = f => fs.readFileSync(new URL(`../arneyan/${f}`, import.meta.url), "utf8");
const m = src("module/bulkselect.mjs");
assert.ok(/renderActorDirectory/.test(m) && /renderItemDirectory/.test(m) && /game\.user\.isGM/.test(m));
assert.ok(/DialogV2\.confirm/.test(m) && /can't be undone/.test(m), "a confirmation before deleting");
assert.ok(/ev2\.key === "Enter"/.test(m), "Enter in the search box only searches");
assert.ok(/const gone = \(await cls\.deleteDocuments/.test(m), "counts what was really deleted");
assert.ok(/partyFolder\(\)/.test(m) && /inParty\(d\.folder\)/.test(m), "the party's folder, at any depth");
assert.ok(/registerBulkSelect\(\)/.test(src("module/arneyan.mjs")));
assert.ok(/\.arn-bulk-list/.test(src("styles/gmtools.css")));
console.log("OK select many");

/* 0.10.121 (Kieran, 17 Nov): Summoned and Transformed live inside Player Characters, beside Allies, Mounts & Pets. */
const party = src("module/party.mjs");
assert.ok(/export async function partySubfolder\(name\)/.test(party) && /folder: pf\?\.id \?\? null/.test(party), "made inside the party folder");
assert.ok(/await loose\.update\(\{ folder: pf\.id \}\)/.test(party), "an old top-level one moves in");
assert.ok(/for \(const name of \[SUMMONED, TRANSFORMED\]\)/.test(party), "moved on the GM's first load");
assert.ok(/!inPartyWorkFolder\(a\.folder\) && !a\.flags\?\.\[SYS\]\?\.transform/.test(party), "a changed shape or a summon is never a party member");
assert.ok(/partySubfolder\(FOLDER\)/.test(src("module/summons.mjs")) && /partySubfolder\(FOLDER\)/.test(src("module/transform.mjs")));
assert.ok(/if \(workFolder\(f\)\) return false;/.test(m), "Select still lists summoned and transformed creatures");
const nested = [{ id: "w", name: "Wolf", type: "npc", folder: { id: "s2", name: "Player Characters / Summoned" }, party: false }];
assert.deepEqual(B.bulkGroups(nested).map(g => g.name), ["Player Characters / Summoned"]);
console.log("OK party subfolders");

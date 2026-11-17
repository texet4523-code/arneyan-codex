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

/* Behaviour: partySubfolder with a fake world (folders inside the party folder, moved in, or made there). */
{
  const folders = [];
  let made = 0;
  const mk = (id, name, parent = null) => { const f = { id, type: "Actor", name, folder: parent, update: async u => { f.folder = folders.find(x => x.id === u.folder) ?? null; } }; folders.push(f); return f; };
  const pc = mk("PC", "Player Characters");
  game.folders = Object.assign(folders, { get: id => folders.find(f => f.id === id) });
  game.settings = { get: (s, k) => (k === "partyFolderId" ? "PC" : "") };
  game.user = { isGM: true };
  globalThis.Folder = { create: async d => { made++; await new Promise(r => setTimeout(r, 10)); return mk(`N${made}`, d.name, folders.find(f => f.id === d.folder) ?? null); } };
  const P = await import("../arneyan/module/party.mjs");
  const [a, b] = await Promise.all([P.partySubfolder("Summoned"), P.partySubfolder("Summoned")]);
  assert.equal(a, b, "two at once: one folder"); assert.equal(made, 1); assert.equal(a.folder, pc, "made inside Player Characters");
  const loose = mk("L", "Transformed");
  assert.equal(await P.partySubfolder("Transformed"), loose); assert.equal(loose.folder, pc, "an old top-level one moved in");
  assert.equal(P.inPartyWorkFolder(a), true); assert.equal(P.inPartyWorkFolder(loose), true); assert.equal(P.inPartyWorkFolder(pc), false);
  const shapes = [{ id: "s", name: "Ilsa (Wolf)", type: "character", folder: { id: "T", name: "Player Characters / Transformed" }, party: false, shape: true }];
  assert.equal(B.bulkGroups(shapes).length, 1, "a changed shape is listed even if it was copied from a character");
  console.log("OK party subfolders (behaviour)");
}

/* F-R9 (Kieran, 17 Nov): the party's own folders sit below its characters, in a set order; no show/hide setting. */
{
  const P = await import("../arneyan/module/party.mjs");
  const pc = game.folders.find(f => f.id === "PC");
  for (const [id, name] of [["AL", "Allies, Mounts & Pets"], ["X", "Notes"]]) game.folders.push({ id, type: "Actor", name, folder: pc });
  game.settings = { get: (s, k) => (k === "partyFolderId" ? "PC" : k === "alliesFolderId" ? "AL" : "") };
  const order = P.partyFolderOrder(pc).map(f => f.name);
  assert.equal(order[0], "Allies, Mounts & Pets", "Allies first");
  assert.ok(order.indexOf("Transformed") > order.lastIndexOf("Summoned"), "Summoned before Transformed");
  assert.ok(order.includes("Summoned") && order.includes("Transformed"), JSON.stringify(order));
  assert.ok(!P.partyFolderOrder(pc).some(f => f.name === "Notes"), "a GM's own subfolder is left where Foundry puts it");
  // The DOM move, with a fake list: entries and a GM's own folder stay put, the party's folders go last in order.
  const ids = { AL: "Allies, Mounts & Pets", X: "Notes" };
  for (const f of game.folders.filter(f => f.folder === pc && !ids[f.id])) ids[f.id] = f.name;
  const kids = ["AL", ...Object.keys(ids).filter(k => ids[k] === "Transformed"), "X", ...Object.keys(ids).filter(k => ids[k] === "Summoned"), "e:Alex", "e:Bryn"];
  const ol = { kids: [...kids],
    querySelector(sel) { const id = /data-folder-id="([^"]+)"/.exec(sel)?.[1]; return this.kids.includes(id) ? id : null; },
    append(el) { this.kids = this.kids.filter(k => k !== el).concat(el); } };
  P.orderPartySubfolders(ol, pc);
  const named = ol.kids.map(k => (k.startsWith("e:") ? k : ids[k]));
  assert.deepEqual(named.slice(0, 3), ["Notes", "e:Alex", "e:Bryn"], named.join(" | "));
  assert.equal(named[3], "Allies, Mounts & Pets");
  assert.equal(named.at(-1), "Transformed", named.join(" | "));
  assert.ok(named.slice(4, -1).every(n => n === "Summoned"), named.join(" | "));
  P.orderPartySubfolders(null, pc); // no list: no throw
  // An empty Allies setting still finds Allies by name inside the party folder.
  game.settings = { get: (s, k) => (k === "partyFolderId" ? "PC" : "") };
  assert.equal(P.partyFolderOrder(pc)[0]?.name, "Allies, Mounts & Pets", "Allies first without the setting");
  assert.ok(/orderPartySubfolders\(li\?\.querySelector[\s\S]{0,80}folder\);\s*const party = activeParty\(\)/.test(party), "the sidebar reorders before (and without) the party actor");
  assert.ok(!/showPartyFolders|hidePartyFolders/.test(party), "no show/hide toggle");
  console.log("OK party folders below the characters");
}

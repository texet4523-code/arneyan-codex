// Books v0.10.56 to v0.10.58 (R-B59 to R-B64): Paths, renamed kits and features keeping their ids, and worlds taking
// the new names. Runs on its own.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

const read = dir => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith("items_"))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const kits = read("kits");
const paths = cls => kits.filter(k => k.system.className === cls && k.name.startsWith("Path: ")).map(k => k.name).sort();
assert.deepEqual(paths("Knight"), ["Path: Castellan (Knight)", "Path: Cavalier (Knight)", "Path: Champion (Knight)", "Path: Hedge Knight (Knight)", "Path: Knight Errant (Knight)"]);
assert.deepEqual(paths("Ranger"), ["Path: Beast Master (Ranger)", "Path: Hunter (Ranger)", "Path: Wild Warden (Ranger)"]);
assert.deepEqual(paths("Spellblade"), ["Path: Battle Caster (Spellblade)"]);
assert.ok(!kits.some(k => k.system.className === "Knight" && !/^(Path|Deity): /.test(k.name)), "Knights take a Path and no kit");
const cav = kits.find(k => k.name === "Path: Cavalier (Knight)").system.features;
assert.deepEqual(cav.map(f => [f.name, f.level]), [["Saddle-Born", 1], ["The Order's Name", 1], ["Lancer's Charge", 5], ["Mounted Champion", 10]]);

// Ids kept: a renamed kit is the same document (Gladiator was "Gladiator — The Pit-Forged"), a Path the kit it grew from.
const id = n => kits.find(k => k.name === n)?._id;
assert.equal(id("Gladiator (Fighter)"), "AVBy314CbBUdzNTB");
assert.equal(id("Path: Battle Caster (Spellblade)"), "o15Vvrk1VosCMHlq");
assert.equal(id("Path: Castellan (Knight)"), "WtB20YgHDIiDxb5Q");
const cf = read("class-features");
assert.equal(cf.find(f => f.name === "Press On")._id, "Q8Rzh5IxUJGo4mc7", "the Fighter's Extra Attack, renamed in place");
assert.equal(cf.find(f => f.name === "Exploit (Sneak Attack)")._id, "ksFXEzB68ifNtFcY");
assert.ok(!cf.some(f => f.name === "Extra Attack" && ["Fighter", "Barbarian", "Knight", "Rogue", "Assassin", "Ranger", "Swashbuckler", "Gunslinger"].includes(f.system.className)));

// Worlds: the update renames them, from any older name.
const M = await import("../arneyan/module/migrate.mjs");
const R = M.RENAMED_FEATURES;
assert.deepEqual(R["Compendium.arneyan.kits.Item.AVBy314CbBUdzNTB"], [["Gladiator, The Pit-Forged (Fighter)", "Gladiator — The Pit-Forged (Fighter)"], "Gladiator (Fighter)"]);
assert.deepEqual(R["Compendium.arneyan.class-features.Item.Q8Rzh5IxUJGo4mc7"], ["Extra Attack", "Press On"]);
assert.deepEqual(R["Compendium.arneyan.kits.Item.o15Vvrk1VosCMHlq"][1], "Path: Battle Caster (Spellblade)");
assert.ok(R["Compendium.arneyan.kits.Item.o15Vvrk1VosCMHlq"][0].includes("Battle Caster (Magus)"));
const src = fs.readFileSync(new URL("../arneyan/module/migrate.mjs", import.meta.url), "utf8");
assert.ok(src.includes("[rn[0]].flat().includes(i.name)"), "one old name or several");

// The importer and the 1st-level steps.
const I = await import("../arneyan/module/import.mjs");
assert.equal(await I.currentKitName("Dul Khagul Shieldbearer"), "Shield-Wall");
assert.equal(await I.currentKitName("Hedge Knights"), "Path: Hedge Knight");
assert.equal(await I.currentKitName("Heavy Hand"), "Heavy Hand", "a current name stays");
const prog = fs.readFileSync(new URL("../arneyan/module/progression.mjs", import.meta.url), "utf8");
assert.ok(prog.includes('const PATH_AND_KIT = new Set(["Ranger"]);') && prog.includes('key: "path"'), "a Ranger picks a Path, then a Kit");
console.log("OK paths");

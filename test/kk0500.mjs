// Keeps & Kingdoms in Foundry (R-F28, K117, K119): Chapter 6's creatures as actors, every chapter as a journal.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

const read = sub => {
  const dir = new URL(`../packs-src/${sub}/`, import.meta.url);
  return fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(new URL(f, dir), "utf8")));
};
const sys = JSON.parse(fs.readFileSync(new URL("../arneyan/system.json", import.meta.url), "utf8"));
for (const p of ["kk-rules", "kk-monsters"]) {
  assert.ok(sys.packs.some(x => x.name === p), `pack ${p}`);
  assert.ok(sys.packFolders.find(f => f.name === "Keeps & Kingdoms").packs.includes(p));
}
const mons = read("kk-monsters").filter(d => d.type === "npc");
assert.equal(mons.length, 19, "nineteen creature blocks");
const by = Object.fromEntries(mons.map(d => [d.name, d]));
// Minions ticked (K101), with 1 HP; others not.
const minions = ["Angulotl Tadpole", "Goblin Runner", "Kobold Shieldbearer", "Orc Raider", "Hobgoblin Legionnaire", "Gnoll Ravager", "Grave Shambler"];
for (const n of minions) { assert.equal(by[n].system.attributes.minion, true, n); assert.equal(by[n].system.attributes.hp.max, 1, n); }
assert.equal(mons.filter(d => d.system.attributes.minion).length, minions.length);
// Saves as the block gives them; Levels; the solo with villain actions and opener damage.
assert.deepEqual(by["Angulotl Needler"].system.saves, { fort: 3, ref: 6, will: 4 });
assert.equal(by["Goblin Runner"].system.levelText ?? by["Goblin Runner"].system.details.levelText, "½");
const worm = by["Kingfissure Worm"];
assert.equal(worm.system.details.isSolo, true);
assert.equal(worm.system.level, 15);
// v0.5.4: marked Solo in M&T's way ("Level 15 · Solo"), 110 HP a phase, on Running a Solo with its own villain actions.
assert.equal(worm.system.attributes.hp.max, 110);
assert.equal(worm.system.details.soloType, "");
assert.equal(worm.system.details.type, "monstrosity");
assert.equal(worm.system.details.size, "gargantuan");
assert.ok(!worm.items.some(i => i.name.startsWith("Solo")), "the Solo line is not an ability");
assert.ok(!JSON.stringify(worm).includes("Bloodied"), "no Bloodied on the worm");
const va = worm.items.filter(i => i.flags?.arneyan?.villainAction);
assert.deepEqual(va.map(i => i.flags.arneyan.villainAction), [1, 2, 3]);
// M&T v0.10.75: the opener note went with the old rule; Keeps & Kingdoms' worm keeps its own three.
assert.ok(!va[0].system.description.includes("Opener damage"));
assert.ok(worm.items.some(i => i.type === "weapon" && i.name === "Tongue ×3"));
// Leaders have their Command; "as the blade" abilities are copied; GM lines aren't abilities.
for (const n of ["Goblin Warlord", "Orc Bloodchief", "Hobgoblin War Captain"]) {
  assert.ok(by[n].items.some(i => i.name.startsWith("Command")), `${n} Command`);
  assert.ok(by[n].system.details.description.includes("<strong>Leader</strong>"), n);
}
assert.ok(by["Angulotl Seer"].items.some(i => i.name === "Toxic Skin"));
assert.ok(by["Goblin Warlord"].items.some(i => i.name === "Scimitar ×2") && by["Goblin Warlord"].items.some(i => i.name === "Shortbow ×2"));
assert.ok(mons.every(d => d.items.every(i => !/^A |^Where /.test(i.name))), "no GM line as an ability");
// Journals: six chapters; MCDM named once, in the small print on the first page (K104).
const js = read("kk-rules").filter(d => d.pages);
assert.equal(js.length, 6);
const all = JSON.stringify(js);
assert.equal((all.match(/MCDM/g) ?? []).length, 2, "the small print's two mentions only");
assert.ok(js.find(j => j.name === "Chapter 1: Strongholds").pages[0].text.content.includes("Not an MCDM product"));
assert.ok(JSON.stringify(read("kk-monsters")).indexOf("MCDM") < 0);
console.log("kk0500 ok");

// Review fixes (0.10.101): GM-only creatures, the mindless Shambler, once-a-day uses, the Corpse Herder's slots.
assert.equal(sys.packs.find(p => p.name === "kk-monsters").ownership.PLAYER, "NONE");
assert.equal(by["Grave Shambler"].system.attributes.morale, 12);
for (const [n, a] of [["Angulotl Seer", "Toxic Bubble"], ["Dragonet", "Revealing Breath"], ["Lightbender", "Hypnotic Mane"], ["Orc Bloodchief", "Relentless"], ["Hobgoblin War Captain", "Rally"]]) {
  const it = by[n].items.find(i => i.name.startsWith(a));
  assert.equal(it?.system.uses?.max, 1, `${n}: ${a} once per day`);
}
assert.equal(by["Corpse Herder"].system.spellcasting.className, "Necromancer");
assert.equal(by["Corpse Herder"].system.spellcasting.level, 5);
console.log("kk0500 review fixes ok");

// v0.5.4 (B-F76): the Orc Warchief is the Orc Bloodchief with the id it had; saves at Level 1 and ½ use half Level (minimum 1).
assert.equal(by["Orc Bloodchief"]._id, "5D0dxP8bEFMEmBSs");
assert.ok(!by["Orc Warchief"] && !JSON.stringify(by["Orc Bloodchief"]).toLowerCase().includes("warchief"));
for (const [n, sv] of [["Angulotl Tadpole", [1, 3, 1]], ["Angulotl Blade", [2, 3, 2]], ["Dragonet", [2, 3, 2]], ["Goblin Runner", [1, 3, 0]],
  ["Kobold Shieldbearer", [1, 3, 0]], ["Grave Shambler", [3, -1, -1]], ["Corpse Herder", [3, 3, 3]]])
  assert.deepEqual(by[n].system.saves, { fort: sv[0], ref: sv[1], will: sv[2] }, n);
const ch1 = JSON.stringify(js.find(j => j.name === "Chapter 1: Strongholds"));
assert.ok(ch1.includes("Version 0.5.9") && ch1.includes("Sent, not summoned"));
// v0.5.5 (B-F80): the angulotl seer's Toxic Bubble is DC 18.
{
  const seer = JSON.parse(fs.readFileSync(new URL("../packs-src/kk-monsters/actors_Angulotl_Seer_RD2TeSU0N6Nrre0k.json", import.meta.url), "utf8"));
  const bubble = JSON.stringify(seer.items.find(i => /Toxic Bubble/.test(i.name)));
  assert.ok(/"dc":18/.test(bubble) && /dc:18/.test(bubble) && !/dc"?:17/.test(bubble), "Toxic Bubble DC 18");
}
assert.ok(JSON.stringify(js).includes("Deteron") && !JSON.stringify(js).includes("Depsopteron"));
console.log("kk v0.5.5 ok");

/* The world update (0.10.117): a Kingfissure Worm still on 375 HP takes 110 a phase; one with its own HP keeps it;
   the two lines about Bloodied are swapped where they stand and the GM's own words stay. */
const M = await import("../arneyan/module/migrate.mjs");
assert.equal(M.KK_SOLO, "0.10.117");
const wHp = (value, max, more = {}) => ({ isToken: false, system: { attributes: { hp: { value, max } }, details: {} }, items: [], ...more });
const up = (...a) => M.kkSoloHp(...a)?.update;
assert.deepEqual(M.kkSoloHp(wHp(375, 375), worm), { update: { "system.attributes.hp.max": 110, "system.attributes.hp.value": 110 }, items: [] });
assert.deepEqual(up(wHp(60, 375), worm), { "system.attributes.hp.max": 110 }, "hurt below the new maximum: its HP stays");
assert.equal(up(wHp(200, 375), worm)["system.attributes.hp.value"], 110, "above the new maximum: brought down");
assert.equal(M.kkSoloHp(wHp(500, 500), worm), null, "the GM's own HP is kept");
assert.equal(M.kkSoloHp(wHp(110, 110), worm), null, "already updated");
assert.equal(M.kkSoloHp(wHp(375, 375), by["Lightbender"]), null, "not a solo");
// The stored maximum decides, not the worked-out one (Exhaustion halves it; an effect raises it).
assert.deepEqual(up(wHp(187, 187, { _source: { system: { attributes: { hp: { max: 375 } } } } }), worm), { "system.attributes.hp.max": 110, "system.attributes.hp.value": 110 });
assert.equal(M.kkSoloHp(wHp(375, 375, { _source: { system: { attributes: { hp: { max: 750 } } } } }), worm), null, "stored 750, halved to 375: the GM's");
// An unlinked token: its actor was updated first, so its maximum is already 110 while its own current HP may not be.
assert.deepEqual(M.kkSoloHp(wHp(300, 110, { isToken: true }), worm), { update: { "system.attributes.hp.value": 110 }, items: [] });
assert.equal(M.kkSoloHp(wHp(90, 110, { isToken: true }), worm), null);
assert.equal(M.kkSoloHp(wHp(140, 150, { isToken: true, _source: { system: { attributes: { hp: { max: 110 } } } } }), worm), null, "an effect raised its maximum: left alone");
assert.equal(M.kkSoloHp(wHp(300, 110), worm), null, "only a token: a world actor above its maximum is the GM's business");
// Text: the old GM line and Three Tongues; edits around them stay; a token leaves text to its actor.
const oldDesc = "<p>My note.</p><p><strong>GM:</strong> A kingfissure worm leaves when it's Bloodied and has eaten. It has no reason to die for a meal.</p>";
const oldItems = [{ id: "t3", system: { description: "<p>... until it next rests. Bloodied doesn't regrow them.</p>" } }, { id: "sw", system: { description: "<p>Swallow.</p>" } }];
const txt = M.kkSoloHp(wHp(110, 110, { system: { attributes: { hp: { value: 110, max: 110 } }, details: { description: oldDesc } }, items: oldItems }), worm);
assert.equal(txt.update["system.details.description"], "<p>My note.</p><p><strong>GM:</strong> A kingfissure worm leaves once it has changed phase and eaten. It has no reason to die for a meal.</p>");
assert.deepEqual(txt.items, [{ _id: "t3", "system.description": "<p>... until it next rests. A phase change doesn't regrow them.</p>" }]);
assert.equal(M.kkSoloHp(wHp(110, 110, { isToken: true, system: { attributes: { hp: { value: 110, max: 110 } }, details: { description: oldDesc } }, items: oldItems }), worm), null);
// The swapped text is exactly what the compendium now carries.
const before = JSON.parse(JSON.stringify(worm));
before.system.details.description = before.system.details.description.replace("leaves once it has changed phase and eaten", "leaves when it's Bloodied and has eaten");
const tt = before.items.find(i => i.name === "Three Tongues");
tt.system.description = tt.system.description.replace("A phase change doesn't regrow them", "Bloodied doesn't regrow them");
before.system.attributes.hp = { value: 375, max: 375 };
const full = M.kkSoloHp(before, worm);
assert.equal(full.update["system.details.description"], worm.system.details.description);
assert.equal(full.items[0]["system.description"], worm.items.find(i => i.name === "Three Tongues").system.description);
const migSrc = fs.readFileSync(new URL("../arneyan/module/migrate.mjs", import.meta.url), "utf8");
assert.ok(/newerThan\(KK_SOLO, from\) && !newerThan\(KK_SOLO, version\)/.test(migSrc) && /const r = kkSoloHp\(actor, await fetch\(src\)\)/.test(migSrc));
console.log("kk solo update ok");

// The Orc Bloodchief's abilities keep the ids the Orc Warchief's had; a world copy on the old name still finds its art.
assert.deepEqual(by["Orc Bloodchief"].items.map(i => i._id), ["z1S0sDdpsYjOukTJ", "9C5yfcvo5tBifjtN", "ruz26T1TACb5JflV"]);
const A = await import("../arneyan/module/art.mjs");
assert.equal(A.RENAMED_MONSTERS["Orc Warchief"], "Orc Bloodchief");
// Numbered lists keep their numbers: the Tower's d8 riders, Mass Combat's Deployment steps under their bullet.
const tower = js.find(j => j.name === "Chapter 1: Strongholds").pages.find(p => p.name === "The Tower").text.content;
assert.ok(/<ol><li><strong>Empowering:<\/strong>/.test(tower) && (tower.match(/<ol>/g) ?? []).length === 4, "four d8 lists");
assert.ok(/<li><strong>Deployment:<\/strong><ol><li>Roll side initiative/.test(JSON.parse(JSON.stringify(js.find(j => j.name === "Chapter 4: Mass Combat"))).pages.map(p => p.text.content).join("")));
console.log("kk review fixes (0.10.117) ok");

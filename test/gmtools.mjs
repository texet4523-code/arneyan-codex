// GM tools: group rolls, XP, treasure codes and rolling, No. appearing, hazards and environmental clocks, roll tables.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeActor, hbs } from "./harness.mjs";

const root = new URL("../arneyan/", import.meta.url).pathname;
const packsSrc = new URL("../packs-src/", import.meta.url).pathname;
const { ARNEYAN } = await import("../arneyan/module/config.mjs");
const T = await import("../arneyan/module/treasure.mjs");
const G = await import("../arneyan/module/gmtools.mjs");
const H = await import("../arneyan/module/hazards.mjs");
const { HazardData } = await import("../arneyan/module/data/hazard-models.mjs");
const { parseNumberAppearing } = await import("../arneyan/module/encounter.mjs");

/* ---------------- Dice for tests ---------------- */
// "2d6 * 10", "1d100", "1d20": each NdM replaced by the strategy's result, then the arithmetic worked out.
const roller = pickDie => async formula => {
  const expr = String(formula).replace(/(\d*)d(\d+)/g, (m, n, f) => {
    let t = 0;
    for (let i = 0; i < (Number(n) || 1); i++) t += pickDie(Number(f));
    return String(t);
  });
  assert.match(expr, /^[\d\s+\-*]+$/, `bad formula ${formula}`);
  return Function(`"use strict"; return (${expr});`)();
};
const maxRoll = roller(f => f);
const minRoll = roller(() => 1);
let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const randRoll = roller(f => 1 + Math.floor(rand() * f));

/* ---------------- Treasure codes ---------------- */
assert.deepEqual(T.parseTreasureCode("<p>Treasure type <strong>S, lair E</strong> (see the Treasure tables).</p>"),
  [{ code: "S", lair: false, kind: "individual" }, { code: "E", lair: true, kind: "hoard" }]);
assert.deepEqual(T.parseTreasureCode("lair H"), [{ code: "H", lair: true, kind: "hoard" }]);
assert.deepEqual(T.parseTreasureCode("N"), []);
assert.deepEqual(T.parseTreasureCode("-"), []);
assert.deepEqual(T.parseTreasureCode("<p>Treasure type <strong>R</strong></p>"), [{ code: "R", lair: false, kind: "individual" }]);
assert.deepEqual(T.parseTreasureCode("N, lair D").map(p => p.code), ["D"]);
assert.equal(T.describeCode(T.parseTreasureCode("S, lair E")), "Individual S, Hoard E in the lair");

// Every monster's code reads (none left over that isn't N or blank).
if (fs.existsSync(path.join(packsSrc, "monsters"))) {
  let read = 0;
  for (const f of fs.readdirSync(path.join(packsSrc, "monsters"))) {
    const d = JSON.parse(fs.readFileSync(path.join(packsSrc, "monsters", f)));
    if (d.type !== "npc") continue;
    const raw = (d.system.details.treasure.match(/<strong>([^<]*)<\/strong>/) ?? [])[1] ?? "";
    const parts = T.parseTreasureCode(d.system.details.treasure);
    const expected = raw.split(",").map(s => s.trim()).filter(s => s && s !== "N" && s !== "-").length;
    assert.equal(parts.length, expected, `${d.name}: "${raw}"`);
    read++;
    // No. appearing reads as dice for every stat block.
    const na = parseNumberAppearing(d.system.details.numberAppearing);
    if (d.system.details.numberAppearing) assert.ok(na.wild, `${d.name}: No. "${d.system.details.numberAppearing}"`);
    if (/lair/.test(d.system.details.numberAppearing)) assert.ok(na.lair, `${d.name}: lair No. "${d.system.details.numberAppearing}"`);
  }
  assert.ok(read > 400);
}

/* ---------------- Rolling treasure ---------------- */
{
  // Most: hoard H, everything at its maximum.
  const r = await T.rollTreasure(T.parseTreasureCode("H"), { roll: maxRoll });
  assert.equal(r.coins.gp, 60000);
  const gems = r.items.filter(i => i.kind === "gem");
  assert.equal(gems.reduce((t, i) => t + i.qty, 0), 24);           // 4d6 Superb gems
  assert.ok(gems.every(g => g.value === 5000 && g.bundle === 5));  // a 6 on the Superb column: Jewel
  const art = r.items.filter(i => i.kind === "art");
  assert.equal(art.reduce((t, i) => t + i.qty, 0), 12);            // 2d6 Major art
  assert.ok(art.every(a => a.value === 3000 && a.slots === 2));
  const magic = r.items.filter(i => i.kind === "magic");
  assert.equal(magic.length, 2);                                    // one Very Rare and one Rare
  assert.equal(magic[0].name, "Mace of Delving");                   // d10 10, d12 12
  assert.ok(magic[1].name.startsWith("Iconic Rare item"));          // d20 20: the GM's choice
  assert.equal(r.value, 60000 + 24 * 5000 + 12 * 3000);
}
{
  // Least: hoard C, every die a 1 (the 20% item comes up on a 1).
  const r = await T.rollTreasure(T.parseTreasureCode("C"), { roll: minRoll });
  assert.equal(r.coins.gp, 200);
  assert.deepEqual(r.items.map(i => [i.kind, i.qty, i.value]), [["gem", 1, 10], ["magic", 1, 450]]);
  assert.equal(r.items[1].name, "Weapon +1");
  assert.equal(r.items[0].name, "Azurite (Ornamental gem)");
}
{
  // Individual treasure is rolled for each creature; lair hoards can be left out.
  const r = await T.rollTreasure(T.parseTreasureCode("P, lair B"), { roll: maxRoll, count: 4, lair: false });
  assert.equal(r.coins.sp, 48);
  assert.equal(r.sections.length, 1);
  const s = await T.rollTreasure(T.parseTreasureCode("S"), { roll: minRoll, count: 3 });
  assert.equal(s.coins.gp, 12);
  assert.equal(s.items.filter(i => i.kind === "gem").reduce((t, i) => t + i.qty, 0), 3); // 25% each time (1 on d100)
  assert.equal(s.items.length, 1);                                  // three Azurites stack
}
{
  // Trade goods instead of some of the coin.
  const r = await T.rollTreasure(T.parseTreasureCode("E"), { roll: maxRoll, tradeLots: 2 });
  assert.equal(r.items.filter(i => i.kind === "trade").reduce((t, i) => t + i.qty, 0), 2);
  assert.equal(r.coins.gp, 6000 - 600);                             // two lots of fine weapons (300 gp)
  assert.ok(r.items.filter(i => i.kind === "trade").every(i => i.slots === 2));
}
// Lots of random hoards: well formed, no negative coin, every item named.
for (let i = 0; i < 300; i++) {
  const code = "ABCDEFGH"[i % 8];
  const r = await T.rollTreasure([{ code, lair: true, kind: "hoard" }, { code: "PQRS"[i % 4], lair: false, kind: "individual" }], { roll: randRoll, count: 1 + (i % 5), tradeLots: i % 3 });
  assert.ok(Object.values(r.coins).every(v => Number.isInteger(v) && v >= 0));
  for (const it of r.items) { assert.ok(it.name && it.qty >= 1, JSON.stringify(it)); assert.ok(!/undefined/.test(it.name)); }
}
// Every magic table result.
for (const rarity of ["uncommon", "rare", "veryRare"]) {
  for (let d = 1; d <= 10; d++) {
    const items = await T.magicItem(rarity, async f => (f === "1d10" ? d : (await randRoll(f))));
    assert.ok(items.length >= 1 && items.every(i => i.name && i.kind === "magic"), `${rarity} ${d}`);
  }
}

// The card: links where the item is in the compendium, a stash button, no em dashes.
{
  const r = await T.rollTreasure(T.parseTreasureCode("H"), { roll: maxRoll });
  const html = T.treasureCardHtml(r, { title: "Treasure: Red Dragon", code: "lair H", uuids: { "Mace of Delving": "Compendium.arneyan.equipment.Item.abc" } });
  assert.ok(html.includes("@UUID[Compendium.arneyan.equipment.Item.abc]{Mace of Delving}"));
  assert.ok(html.includes("arn-tr-stash"));
  assert.ok(html.includes("60,000 gp"));
  assert.ok(!html.includes("—"));
  const none = T.treasureCardHtml(await T.rollTreasure([], { roll: maxRoll }), { title: "x" });
  assert.ok(none.includes("Nothing worth taking") && !none.includes("arn-tr-stash"));
}

/* ---------------- The tables in the code match the built roll tables ---------------- */
const tablesDir = path.join(packsSrc, "tables");
if (fs.existsSync(tablesDir)) {
  const tables = Object.fromEntries(fs.readdirSync(tablesDir).filter(f => f.startsWith("tables_")).map(f => JSON.parse(fs.readFileSync(path.join(tablesDir, f)))).map(t => [t.name, t]));
  const names = t => tables[t].results.map(r => r.name);
  assert.deepEqual(names("Iconic Uncommon Items"), T.ICONIC_UNCOMMON);
  assert.deepEqual(names("Iconic Rare Items").slice(0, 17), T.ICONIC_RARE);
  assert.deepEqual(names("Iconic Very Rare Items").slice(0, 11), T.ICONIC_VERY_RARE.slice(0, 11));
  assert.deepEqual(names("Trade Goods"), T.TRADE_GOODS.map(([n, v]) => `${n} (${v} gp)`));
  assert.deepEqual(names("Minor Art Objects"), T.ART.minor.examples);
  assert.deepEqual(names("Major Art Objects"), T.ART.major.examples);
  for (const [grade, col] of Object.entries(T.GEM_GRADES)) {
    const t = tables[`${grade[0].toUpperCase()}${grade.slice(1)} Gems`];
    assert.deepEqual(t.results.map(r => r.name), col.map(k => `${T.GEM_TIERS[k].label} (${T.GEM_TIERS[k].value.toLocaleString("en-GB")} gp)`));
  }
  for (const tier of Object.values(T.GEM_TIERS)) assert.deepEqual(names(`${tier.label} Stones (${tier.value.toLocaleString("en-GB")} gp)`), tier.stones);
  // Every table covers its die exactly once, and the sub-tables link up.
  for (const t of Object.values(tables)) {
    const faces = t.formula === "2d6" ? [2, 12] : [1, Number(t.formula.split("d")[1])];
    const hit = [];
    for (const r of t.results) for (let n = r.range[0]; n <= r.range[1]; n++) hit.push(n);
    assert.deepEqual(hit.sort((a, b) => a - b), Array.from({ length: faces[1] - faces[0] + 1 }, (_, i) => faces[0] + i), t.name);
    for (const r of t.results) assert.ok(!/—/.test(r.name), `${t.name}: ${r.name}`);
  }
  const rare = tables["Rare Magic Items"].results.find(r => r.range[0] === 5);
  assert.equal(rare.documentUuid, `Compendium.arneyan.tables.RollTable.${tables["Iconic Rare Items"]._id}`);
  assert.ok(tables["Iconic Rare Items"].results[0].documentUuid.startsWith("Compendium.arneyan.equipment.Item."));
  assert.ok(Object.keys(tables).length >= 25);
}

/* ---------------- No. appearing ---------------- */
assert.deepEqual(parseNumberAppearing("2d6 (lair 20-200)"), { wild: "2d6", lair: "1d181 + 19" });
assert.deepEqual(parseNumberAppearing("1"), { wild: "1", lair: null });
assert.deepEqual(parseNumberAppearing("4-36"), { wild: "1d33 + 3", lair: null });
assert.deepEqual(parseNumberAppearing("10d6 (lair 100-1,000)"), { wild: "10d6", lair: "1d901 + 99" });
assert.deepEqual(parseNumberAppearing("1d8 (lair 2d12)"), { wild: "1d8", lair: "2d12" });
assert.deepEqual(parseNumberAppearing("1 (band 4-24)"), { wild: "1", lair: null });
assert.deepEqual(parseNumberAppearing("1d4+1"), { wild: "1d4+1", lair: null });
assert.deepEqual(parseNumberAppearing(""), { wild: null, lair: null });
assert.equal(await maxRoll(parseNumberAppearing("4-36").wild), 36);
assert.equal(await minRoll(parseNumberAppearing("4-36").wild), 4);

/* ---------------- Ask for a roll ---------------- */
assert.equal(G.requestLabel("save", "ref"), "Reflex save");
assert.equal(G.requestLabel("check", "wis"), "Wisdom check");
assert.equal(G.requestLabel("skill", "Tracking"), "Tracking check");
assert.deepEqual(G.resultFromFlags({ kind: "save", total: 13, natural: 9, luckBurned: 1 }, 14), { total: 14, natural: 9, outcome: "success", pass: true });
assert.equal(G.resultFromFlags({ kind: "check", total: 13, natural: 9 }, 14).pass, false);
assert.equal(G.resultFromFlags({ kind: "check", total: 25, natural: 1 }, 14).outcome, "nat1");
assert.equal(G.resultFromFlags({ kind: "check", total: 3, natural: 20 }, 14).pass, true);
assert.equal(G.resultFromFlags({ kind: "save", total: 30, natural: 15, autoFail: true }, 14).outcome, "autofail");
assert.equal(G.resultFromFlags({ kind: "check", total: 12, natural: 10 }, null).pass, null);
{
  const data = { kind: "save", key: "fort", dc: 12, label: "Extreme heat, hour 2", text: "No save needed: Ember.", consequence: "exhaustion", applied: false, members: [
    { uuid: "Actor.a", name: "Aria", img: "a.png", mode: -1, note: "medium or heavy armour", rollId: "m1", total: 15, natural: 12, outcome: "success", pass: true },
    { uuid: "Actor.b", name: "Bram", img: "b.png", mode: 0, note: "", rollId: "m2", total: 8, natural: 6, outcome: "failure", pass: false },
    { uuid: "Actor.c", name: "Cole <x>", img: "c.png", mode: 0, note: "", rollId: "", total: null, natural: null, outcome: "", pass: null }
  ] };
  assert.deepEqual(G.summarise(data.members), { rolled: 2, waiting: 1, passed: 1, failed: 1 });
  const html = G.partyRollHtml(data);
  assert.ok(html.includes("Extreme heat, hour 2") && html.includes("Fortitude save, DC 12") && html.includes("DC 12"));
  assert.ok(html.includes("1 passed, 1 failed, 1 still to roll"));
  assert.ok(html.includes('class="arn-pr-roll" data-uuid="Actor.c"'));
  assert.ok(html.includes("Cole &lt;x&gt;"));
  assert.ok(html.includes("Disadvantage") && html.includes("arn-pr-apply") && html.includes("arn-pr-rest"));
  data.members[2] = { ...data.members[2], rollId: "m3", total: 12, natural: 12, outcome: "success", pass: true };
  data.applied = true;
  const done = G.partyRollHtml(data);
  assert.ok(!done.includes("arn-pr-rest") && !done.includes("arn-pr-apply") && done.includes("Exhaustion applied"));
  assert.ok(G.partyRollHtml({ ...data, dc: null, label: "", consequence: "" }).includes("3 of 3 rolled"));
}

/* ---------------- XP ---------------- */
{
  const party = [{ id: "a", name: "Rogue", xp: 6, rate: 8 }, { id: "b", name: "Wizard", xp: 0, rate: 12 }, { id: "c", name: "Rogue/Wizard", xp: 13, rate: 14 }];
  const each = G.xpAward(party, 2, "each");
  assert.deepEqual(each.rows.map(r => [r.after, r.capped, r.ready]), [[8, false, true], [2, false, false], [14, true, true]]);
  const split = G.xpAward(party, 7, "split");
  assert.equal(split.share, 2); assert.equal(split.left, 1);
  assert.deepEqual(split.rows.map(r => r.after), [8, 2, 14]);
  assert.equal(G.xpAward(party, 2, "split").share, 0);
  assert.equal(G.xpAward([], 5, "split").share, 0);
}

/* ---------------- Hazards ---------------- */
{
  const trap = makeActor(HazardData, "hazard", {
    level: 3, spot: { ability: "wis", dc: 15 }, disable: { ability: "int", dc: 15, skill: "", text: "Wedge the plate" },
    trigger: "A creature steps on the plate", effect: "Darts fly from the walls",
    attack: { label: "Dart", bonus: 6, damage: "1d4", damageType: "piercing" },
    save: { key: "ref", dc: 14, damage: "2d6", damageType: "fire", onSave: "half", condition: "prone" },
    attributes: { ac: 15, hardness: 5, hp: { value: 20, max: 20 } }, saves: { fort: { value: 4 }, ref: { value: 2 } }, details: { immunities: "poison", resistances: "" }
  });
  trap.name = "Dart Trap"; trap.uuid = "Actor.trap"; trap.img = "systems/arneyan/assets/icons/hazard-box-trap.svg";
  const s = trap.system;
  assert.equal(s.acTotal, 15); assert.equal(s.dr, 5);
  assert.deepEqual(s.traits.immune, ["poison"]);
  assert.deepEqual(s.saves.fort.parts, [{ label: "Hazard", value: 4 }]);
  assert.equal(s.getRollData().abilities.dex.mod, 0);
  assert.equal(s.mods.adv("adv.init").values.length, 0);
  const card = H.triggerCardHtml(trap);
  assert.ok(card.includes("Trigger:") && card.includes("A creature steps on the plate"));
  assert.ok(card.includes('class="arn-save-btn" data-save="ref" data-dc="14" data-source="Dart Trap"'));
  assert.ok(card.includes("arn-hz-attack") && card.includes("Dart +6"));
  assert.ok(card.includes('data-which="save"') && card.includes("half on a save"));
  assert.ok(card.includes("@Condition[prone]"));
  assert.ok(!card.includes("—"));
  // The sheet renders.
  const render = hbs(root);
  const ctx = { actor: trap, system: s, source: s, editable: true, isGM: true, abilities: ARNEYAN.abilities, saves: { "": "No save", ref: "Reflex" },
    onSave: { half: "Half" }, kinds: { trap: "Trap" }, damageTypes: { "": "Untyped", fire: "Fire" }, conditions: { "": "None", prone: "Prone" }, spotLabel: "x", disableLabel: "y", description: "" };
  const sheet = render("templates/actor/hazard-sheet.hbs", ctx);
  assert.ok(sheet.includes('name="system.spot.dc"') && sheet.includes('data-action="trigger"') && sheet.includes('data-action="spot"'));
}

/* ---------------- Environmental clocks ---------------- */
assert.equal(H.breathRounds(2), 30);        // 3 minutes
assert.equal(H.breathRounds(0), 10);        // 1 minute
assert.equal(H.breathRounds(-1), 5);        // at least 30 seconds
assert.equal(H.breathRounds(-3), 5);
assert.equal(H.suffocationRounds(3), 3);
assert.equal(H.suffocationRounds(-1), 1);
assert.deepEqual([1, 2, 3, 4].map(H.exposureDc), [10, 12, 14, 16]);
{
  let c = { stage: "breath", left: 2, suffocate: 1 };
  const events = [];
  for (let i = 0; i < 5; i++) { const r = H.advanceBreath(c); c = r.c; events.push(r.event); }
  assert.deepEqual(events, ["", "out", "down", "dying", ""]);
  assert.equal(c.stage, "dying");
  assert.ok(H.breathLabel({ stage: "breath", left: 1 }).includes("1 round left"));
}
{
  const render = hbs(root);
  const html = render("templates/apps/environment.hbs", {
    kinds: [{ id: "breath", label: "Holding breath", icon: "fa-solid fa-lungs" }], quick: [{ id: "flames", label: "Flames", text: "1d6" }],
    timers: [{ id: "t1", label: "Extreme cold", icon: "x", unit: "hour", count: 2, isCold: true, sheltered: true, nextDc: 14, creatures: [{ uuid: "Actor.a", name: "Aria", img: "", status: "", noSave: false }] }]
  });
  assert.ok(html.includes('data-timer="t1"') && html.includes("Fortitude DC 14") && html.includes('data-key="noSave"'));
  const enc = render("templates/apps/encounter.hbs", { b: { tier: "hard", label: "Hard", warnings: [] }, party: [], foes: [{ i: 0, name: "Goblin", img: "", count: 3, cost: "¼", na: "2d4", canRoll: true }], pct: 10,
    naMode: "wild", naModes: [{ id: "off", label: "Off" }, { id: "wild", label: "Wild" }], saved: [{ id: "e1", name: "Goblin ambush", summary: "Goblin × 3" }] });
  assert.ok(enc.includes('data-action="rollNumber"') && enc.includes('data-enc-id="e1"') && enc.includes('value="wild" selected'));
}

/* ---------------- Player-facing text: UK English, no em dashes ---------------- */
for (const f of ["module/gmtools.mjs", "module/treasure.mjs", "module/hazards.mjs", "module/data/hazard-models.mjs", "templates/actor/hazard-sheet.hbs", "templates/apps/environment.hbs", "templates/apps/encounter.hbs"]) {
  const text = fs.readFileSync(path.join(root, f), "utf8");
  assert.ok(!text.includes("—"), `em dash in ${f}`);
  assert.ok(!/\b(color|armor|defense)\b(?![-\w])/i.test(text.replace(/--?[\w-]*colou?r[\w-]*|color-mix|color-scheme|armor\b(?=-)/g, "")), `US spelling in ${f}`);
}

/* ---------------- Group roll flow, with a mock chat log ---------------- */
{
  const msgs = new Map();
  let n = 0;
  class Msg {
    constructor(d) { Object.assign(this, d); this.id = `m${++n}`; this.timestamp = n; this.author ??= game.user; this.flags ??= {}; }
    async update(u) { for (const [k, v] of Object.entries(u)) { if (k.startsWith("flags.")) { const p = k.split("."); this.flags[p[1]][p[2]] = v; } else this[k] = v; } return this; }
  }
  const actors = [];
  globalThis.ChatMessage = { create: async d => { const m = new Msg(d); msgs.set(m.id, m); return m; }, getSpeaker: o => ({ alias: o?.alias ?? o?.actor?.name }), getSpeakerActor: s => actors.find(a => a.name === s.alias) };
  const mk = (name, total) => ({ name, uuid: `Actor.${name}`, id: name, img: "", isOwner: true, type: "character", system: { attributes: { exhaustion: 0 } }, items: [],
    testUserPermission: (u, lvl) => u.id === "p1" ? name === "Aria" : true,
    async update(u) { this.system.attributes.exhaustion = u["system.attributes.exhaustion"]; },
    rollSave: async (k, ev) => ChatMessage.create({ speaker: { alias: name }, flags: { arneyan: { kind: "save", save: k, total, natural: total - 2, luckBurned: 0, ev } } }) });
  actors.push(mk("Aria", 15), mk("Bram", 8));
  const saved = { fromUuid: globalThis.fromUuid, ui: globalThis.ui, Actor: globalThis.Actor, user: game.user, users: game.users, messages: game.messages };
  globalThis.fromUuid = async u => actors.find(a => a.uuid === u);
  globalThis.Actor = Object;
  globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };
  const p1 = { id: "p1", isGM: false };
  game.user = { isGM: true, id: "gm" };
  game.users = { activeGM: { isSelf: true }, get: id => (id === "p1" ? p1 : game.user), filter: () => [] };
  game.messages = { get: id => msgs.get(id), contents: [] };
  const settle = () => new Promise(r => setTimeout(r, 10));

  const card = await G.askForRoll({ actors, kind: "save", key: "fort", dc: 12, label: "Heat", consequence: "exhaustion", per: { "Actor.Bram": { mode: -1 } } });
  await G.rollTheRest(card);
  await settle();
  const d = card.flags.arneyan.partyRoll;
  assert.deepEqual(d.members.map(m => m.pass), [true, false]);
  assert.ok(card.content.includes("1 passed, 1 failed"));
  assert.equal(msgs.get(d.members[1].rollId).flags.arneyan.ev.ctrlKey, true);   // Disadvantage reached the roll
  await G.applyExhaustion(card);
  assert.deepEqual(actors.map(a => a.system.attributes.exhaustion), [0, 1]);
  await G.applyExhaustion(card);                                                 // only once
  assert.deepEqual(actors.map(a => a.system.attributes.exhaustion), [0, 1]);

  // A player's result reaches the card through the GM, checked against the roll message itself.
  const card2 = await G.askForRoll({ actors, kind: "save", key: "ref", dc: 10 });
  const mine = await actors[0].rollSave("ref", {}); mine.author = p1;
  await G.onSocket({ action: "partyRoll", messageId: card2.id, uuid: "Actor.Aria", rollId: mine.id }, "p1");
  await settle();
  assert.equal(card2.flags.arneyan.partyRoll.members[0].pass, true);
  const wrongKind = await actors[1].rollSave("fort", {}); wrongKind.author = p1;
  await G.onSocket({ action: "partyRoll", messageId: card2.id, uuid: "Actor.Bram", rollId: wrongKind.id }, "p1");
  const notMine = await actors[1].rollSave("ref", {}); notMine.author = p1;           // p1 doesn't own Bram
  await G.onSocket({ action: "partyRoll", messageId: card2.id, uuid: "Actor.Bram", rollId: notMine.id }, "p1");
  const someoneElses = await actors[0].rollSave("ref", {});                        // written by the GM, sent by p1
  await G.onSocket({ action: "partyRoll", messageId: card2.id, uuid: "Actor.Aria", rollId: someoneElses.id }, "p1");
  await settle();
  assert.equal(card2.flags.arneyan.partyRoll.members[1].rollId, "");
  assert.equal(card2.flags.arneyan.partyRoll.members[0].rollId, mine.id);
  Object.assign(globalThis, { fromUuid: saved.fromUuid, ui: saved.ui, Actor: saved.Actor });
  Object.assign(game, { user: saved.user, users: saved.users, messages: saved.messages });
}

/* ---------------- The browser's Buy, and resting in a fight ---------------- */
{
  for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
  const B = await import("../arneyan/module/browser.mjs");
  const { priceToPay } = await import("../arneyan/module/itempiles.mjs");
  const { ArneyanActor } = await import("../arneyan/module/documents.mjs");
  const { ArneyanPartySheet } = await import("../arneyan/module/party.mjs");
  const DialogV2 = foundry.applications.api.DialogV2;
  const saved = { ui: globalThis.ui, ChatMessage: globalThis.ChatMessage, user: game.user, combats: game.combats, wait: DialogV2.wait,
    actors: game.actors, folders: game.folders, settings: game.settings };
  const warns = [], chat = [];
  globalThis.ui = { notifications: { warn: m => warns.push(m), info() {}, error: m => warns.push(m) } };
  globalThis.ChatMessage = { create: async d => { chat.push(d); return d; }, getSpeaker: o => ({ alias: o?.actor?.name }) };
  const player = { id: "p1", isGM: false }, gm = { id: "gm", isGM: true };
  const buyer = (currency, isOwner = true) => ({ name: "Aria", id: "aria", isOwner, items: [], system: { currency: { pp: 0, gp: 0, sp: 0, cp: 0, ...currency } },
    async createEmbeddedDocuments(type, data) { this.items.push(...data); return data; },
    async update(u) { for (const [k, v] of Object.entries(u)) foundry.utils.setProperty(this, k, v); } });
  const entry = (name, price, quantity = 1) => ({ name, uuid: `Compendium.arneyan.equipment.Item.${name}`, system: { price, quantity },
    toObject() { return { _id: "x", name, folder: "f", type: "equipment", system: { price, quantity } }; } });

  // Prices: the first amount counts, in copper; nothing to pay means no Buy.
  assert.deepEqual(priceToPay("15 gp"), { cp: 1500, unit: "gp", text: "15 gp" });
  assert.deepEqual(priceToPay("2 sp"), { cp: 20, unit: "sp", text: "2 sp" });
  assert.deepEqual(priceToPay("1 cp each"), { cp: 1, unit: "cp", text: "1 cp" });
  assert.equal(priceToPay("1,000 gp per HD of the dead creature").cp, 100000);
  for (const p of ["", "—", "Unique (never for sale)", "free (found)", "0 gp", null]) assert.equal(priceToPay(p), null, `no price: ${p}`);

  // Enough money: paid gold first, the item added as Add adds it, and a chat line.
  game.user = player;
  const aria = buyer({ gp: 10, sp: 5, cp: 3 });
  const rope = entry("Rope", "2 gp");
  assert.equal(await B.buyItem(aria, rope), true);
  assert.deepEqual(aria.system.currency, { pp: 0, gp: 8, sp: 5, cp: 3 });
  const added = buyer({});
  await B.addToActor(added, rope);
  assert.deepEqual(aria.items, added.items, "Buy adds exactly what Add does");
  assert.equal(aria.items[0]._stats.compendiumSource, rope.uuid);
  assert.ok(!("_id" in aria.items[0]) && aria.items[0].folder === null);
  assert.equal(chat.at(-1).content, "<p>Aria buys Rope for 2 gp. 8 gp, 5 sp, 3 cp left.</p>");
  // Gold short but platinum covers it, with change in gold.
  const plat = buyer({ pp: 1, gp: 1 });
  assert.equal(await B.buyItem(plat, entry("Lantern", "5 gp")), true);
  assert.deepEqual(plat.system.currency, { pp: 0, gp: 6, sp: 0, cp: 0 });

  // Not enough: refused with a warning, nothing taken, nothing added.
  warns.length = 0; chat.length = 0;
  const poor = buyer({ gp: 3, sp: 9, cp: 9 });
  assert.equal(await B.buyItem(poor, entry("Plate Armour", "50 gp")), false);
  assert.deepEqual(poor.system.currency, { pp: 0, gp: 3, sp: 9, cp: 9 });
  assert.equal(poor.items.length, 0);
  assert.equal(chat.length, 0);
  assert.equal(warns[0], "Aria can't afford Plate Armour: it costs 50 gp and Aria has 3 gp, 9 sp, 9 cp.");

  // Copper prices: copper first, a silver broken for change only when there's no copper.
  const candle = entry("Candle", "1 cp each");
  const coppers = buyer({ gp: 1, cp: 3 });
  assert.equal(await B.buyItem(coppers, candle), true);
  assert.deepEqual(coppers.system.currency, { pp: 0, gp: 1, sp: 0, cp: 2 });
  const noCopper = buyer({ gp: 1 });
  assert.equal(await B.buyItem(noCopper, candle), true);
  assert.deepEqual(noCopper.system.currency, { pp: 0, gp: 0, sp: 9, cp: 9 });
  assert.ok(chat.at(-1).content.includes("buys Candle for 1 cp. 9 sp, 9 cp left."));
  // Copper alone can pay for a gold-priced item when the bigger coins can't.
  const jar = buyer({ gp: 0, cp: 150 });
  assert.equal(await B.buyItem(jar, entry("Sack", "1 gp")), true);
  assert.deepEqual(jar.system.currency, { pp: 0, gp: 0, sp: 0, cp: 50 });

  // Who can buy: the owner's player or the GM; no price, no Buy.
  assert.equal(B.canBuyFor(buyer({}, false), player), false);
  assert.equal(B.canBuyFor(buyer({}, false), gm), true);
  assert.equal(B.canBuyFor({ isOwner: true, system: {} }, player), false, "no purse");
  warns.length = 0;
  const notMine = buyer({ gp: 50 }, false);
  assert.equal(await B.buyItem(notMine, rope, player), false);
  assert.equal(notMine.system.currency.gp, 50);
  assert.ok(warns[0].includes("Only Aria's player or the GM"));
  assert.equal(await B.buyItem(notMine, rope, gm), true, "the GM buys for anyone");
  assert.equal(await B.buyItem(buyer({ gp: 50 }), entry("Crown of Ages", "Unique (never for sale)")), false);

  // The window: Buy beside Add where there's a price, none where there isn't.
  const app = new B.ArneyanBrowser();
  app.tab = "equipment"; app.actor = buyer({ gp: 5 }); app.filters = { q: "" };
  app._index = { equipment: [rope, entry("Crown of Ages", "Unique (never for sale)"), candle].map(e => ({ ...e, img: "", type: "equipment", folder: "Gear", group: "Adventuring Gear" })) };
  const ctx = await app._prepareContext();
  assert.ok(ctx.canAdd && ctx.canBuy);
  assert.deepEqual(ctx.rows.map(r => r.buyPrice), ["2 gp", "", "1 cp"]);
  const html = hbs(root)("templates/apps/browser.hbs", ctx);
  assert.equal((html.match(/data-action="add"/g) ?? []).length, 3, "Add on every row, for players too");
  assert.equal((html.match(/data-action="buy"/g) ?? []).length, 2, "Buy only where there's a price");
  assert.ok(html.includes("Pay 2 gp from Aria's purse") && html.includes("Buy pays for it from their purse"));
  assert.ok(!html.includes("—"));
  app.actor = buyer({ gp: 5 }, false);
  assert.ok(!(await app._prepareContext()).canBuy, "no Buy on someone else's character");

  // Resting in a fight: the sheet's Rest warns first, and Cancel (or closing) stops it.
  const dialogs = [];
  const rests = [];
  const resting = { type: "character", name: "Aria", id: "aria", items: [], system: { rest: { haven: 0 } }, restAt: async where => rests.push(where) };
  const answer = warning => (DialogV2.wait = async o => { dialogs.push(o.content); return o.content.includes("in a fight") ? warning : "shelter"; });
  game.combats = [];
  answer("rest");
  await ArneyanActor.prototype.rest.call(resting);
  assert.equal(dialogs.length, 1, "no warning outside a fight");
  assert.ok(dialogs[0].includes("Where are you resting?"));
  assert.deepEqual(rests, ["shelter"]);
  game.combats = [{ id: "c1", started: true, active: true, scene: { id: "s1" }, combatants: [{ actor: resting }] }];
  for (const [reply, rested] of [["cancel", false], [null, false], ["rest", true]]) {
    dialogs.length = 0; rests.length = 0;
    answer(reply);
    await ArneyanActor.prototype.rest.call(resting);
    assert.ok(dialogs[0].includes("Aria is in a fight. Rest anyway?"), "warned in a fight");
    assert.equal(rests.length, rested ? 1 : 0, `${reply}: rest ${rested ? "goes on" : "stopped"}`);
    assert.equal(dialogs.length, rested ? 2 : 1);
  }
  // Someone else's fight doesn't count.
  game.combats = [{ id: "c2", started: true, active: true, scene: { id: "s1" }, combatants: [{ actor: { name: "Goblin" } }] }];
  dialogs.length = 0;
  answer("cancel");
  await ArneyanActor.prototype.rest.call(resting);
  assert.equal(dialogs.length, 1);

  // The party's Rest: the same check, naming who's fighting.
  const pcs = { id: "pcs", name: "Player Characters", type: "Actor", folder: null };
  const member = (name, sort) => ({ type: "character", name, id: name, folder: pcs, sort, items: [], restAt: async () => { rests.push(name); return `${name}: +1 HP.`; } });
  const bram = member("Bram", 1), cael = member("Cael", 2);
  game.actors = Object.assign([bram, cael], { get: id => [bram, cael].find(a => a.id === id) });
  game.folders = { get: id => (id === "pcs" ? pcs : null), find: fn => [pcs].find(fn) };
  game.settings = { get: (scope, key) => (key === "partyFolderId" ? "pcs" : "") };
  game.user = gm;
  const restParty = ArneyanPartySheet.DEFAULT_OPTIONS.actions.restParty;
  const sheet = { document: { name: "The Oddballs" } };
  game.combats = [{ id: "c3", started: true, active: true, scene: { id: "s1" }, combatants: [{ actor: cael }] }];
  dialogs.length = 0; rests.length = 0;
  answer("cancel");
  await restParty.call(sheet);
  assert.ok(dialogs[0].includes("Cael is in a fight. Rest anyway?"));
  assert.equal(rests.length, 0, "Cancel stops the party's rest");
  game.combats = [{ id: "c3", started: true, active: true, scene: { id: "s1" }, combatants: [{ actor: bram }, { actor: cael }] }];
  dialogs.length = 0;
  answer("rest");
  await restParty.call(sheet);
  assert.ok(dialogs[0].includes("Bram and Cael are in a fight. Rest anyway?"));
  assert.deepEqual(rests, ["Bram", "Cael"]);
  game.combats = [];
  dialogs.length = 0; rests.length = 0;
  await restParty.call(sheet);
  assert.equal(dialogs.length, 1, "no warning outside a fight");
  assert.deepEqual(rests, ["Bram", "Cael"]);

  Object.assign(globalThis, { ui: saved.ui, ChatMessage: saved.ChatMessage });
  Object.assign(game, { user: saved.user, combats: saved.combats, actors: saved.actors, folders: saved.folders, settings: saved.settings });
  DialogV2.wait = saved.wait;
}

console.log("OK gmtools");

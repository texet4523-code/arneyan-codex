// 0.10.4 Method V and Starting Scores (Player's Handbook pp. 30-31): the pools, Rule C (two scores of 14 or higher),
// and an ancestry bonus that would take a score past 18 at creation moving to another attribute the owner picks.
// Runs on its own or from test/run.mjs.
import assert from "node:assert/strict";
import "./harness.mjs";

for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
const chat = [], warnings = [];
globalThis.ChatMessage = { create: async m => { chat.push(m); return m; }, getSpeaker: () => ({}) };
globalThis.ui = { notifications: { warn: m => warnings.push(m), info: () => {}, error: m => warnings.push(m) } };
globalThis.Roll ??= class { constructor(f) { this.formula = f; } async evaluate() { this.total = 10; return this; } };
const DialogV2 = foundry.applications.api.DialogV2;
const saved = DialogV2.wait;

const G = await import("../arneyan/module/chargen.mjs");
const P = await import("../arneyan/module/progression.mjs");

/* ---------------- 1. Rolling: Pool 1 8d6, Pool 2 5d6, Pool 3 4d6 keep 3; Pools 4-6 3d6 ---------------- */
assert.deepEqual(G.POOLS, ["8d6kh3", "5d6kh3", "4d6kh3", "3d6", "3d6", "3d6"]);

/* ---------------- 2. Rule C, the Gygaxian Threshold: two scores of 14 or higher ---------------- */
assert.equal(G.meetsThreshold([17, 15, 14, 12, 11, 9]), true, "Example 1, Alex's Set Alpha clears it");
assert.equal(G.meetsThreshold([13, 13, 12, 11, 9, 8]), false, "Rule C example: no score of 14 or higher");
assert.equal(G.meetsThreshold([14, 13, 11, 10, 10, 7]), false, "Rule C example: only one");
assert.equal(G.meetsThreshold([16, 15, 14, 13, 11, 10]), true, "Tamla's donated set");
assert.equal(G.meetsThreshold([14, 14, 9, 8, 7, 6]), true, "14 counts");
assert.equal(G.meetsThreshold([18, 13, 13, 12, 10, 4]), false, "an 18 alone isn't enough");

/* ---------------- 3. The window's text follows the Handbook ---------------- */
{
  let opts = null;
  DialogV2.wait = async o => { opts = o; return "skip"; };
  await G.abilityScores({ isOwner: true, type: "character", name: "Alex" });
  const text = opts.content;
  for (const t of ["8d6, 5d6 and 4d6", "14 or higher", "Gygaxian Threshold", "Rule A", "Rule B", "above 18"]) assert.ok(text.includes(t), `window says ${t}`);
  for (const t of ["6d6", "15 or more", "—", "–"]) assert.ok(!text.includes(t), `window no longer says ${t}`);
}

/* ---------------- 4. Starting Scores: the cap and where the excess goes ---------------- */
// Example 2: Tamla's 18 in Dexterity, 16 in Intelligence; +2 Dexterity moves to Intelligence (16 becomes 18).
const tamla = { str: 14, dex: 18, con: 4, int: 16, wis: 11, cha: 10 };
{
  const { after, over } = P.capAtCreation(tamla, { dex: 2 });
  assert.equal(after.dex, 18);
  assert.deepEqual(over, { dex: 2 });
  assert.equal(P.overflowTarget(after, ["dex"]), "int", "the next best attribute under 18");
  assert.deepEqual(P.capAtCreation(tamla, { con: -1, int: 1 }).over, {}, "nothing over: nothing to move");
  assert.equal(P.overflowTarget({ str: 18, dex: 18, con: 18, int: 18, wis: 18, cha: 18 }), null);
  assert.equal(P.overflowTarget({ str: 12, dex: 18, con: 12, int: 9, wis: 9, cha: 9 }, ["dex"]), "str", "ties go in sheet order");
}
const actorOf = (scores, level = 1) => {
  const items = [];
  items.has = id => items.some(i => i.id === id);
  const a = { id: "A1", name: "Tamla", type: "character", items, updates: [], created: [],
    system: { level }, _source: { system: { abilities: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { value: v }])) } },
    async update(d) { this.updates.push(d); for (const [k, v] of Object.entries(d)) foundry.utils.setProperty(this._source, k, v); },
    async createEmbeddedDocuments(t, data) { this.created.push(...data); return data; },
    async deleteEmbeddedDocuments() {} };
  return a;
};
const ancOf = (actor, name, system) => {
  const anc = { id: "an1", type: "ancestry", name, img: "x.png", flags: {},
    system: { bonuses: {}, pickTwo: false, family: false, traitList: [], choice: null, ...system },
    getFlag(s, k) { return this.flags[s]?.[k]; },
    async update(d) { for (const [k, v] of Object.entries(d)) foundry.utils.setProperty(this, k, v); } };
  actor.items.push(anc);
  return anc;
};
const score = (a, k) => a._source.system.abilities[k].value;

// Dropping an ancestry with +2 Dex on her 18: asked once, the default is Intelligence, and it's recorded.
{
  const actor = actorOf(tamla);
  const anc = ancOf(actor, "Test Folk", { bonuses: { dex: 2 } });
  const asked = [];
  DialogV2.wait = async o => {
    if (o.window.title.endsWith("no score above 18")) { asked.push(o.content); return null; } // closed: the default
    return { choice: null, picks: [], family: "", scores: true };
  };
  await P.ancestrySetup(actor, anc);
  assert.equal(asked.length, 1);
  assert.ok(/value="int" selected/.test(asked[0]), "Intelligence is offered first");
  assert.ok(!/value="dex"/.test(asked[0]), "not the capped attribute");
  assert.equal(score(actor, "dex"), 18);
  assert.equal(score(actor, "int"), 18, "16 becomes 18, as in the Handbook");
  const rec = anc.getFlag("arneyan", "ancestry");
  assert.deepEqual(rec.applied, { dex: 0, int: 2 }, "recorded with the ancestry bonuses");
  assert.deepEqual(rec.moved, { int: 2 });
  assert.ok(chat.at(-1).content.includes("moved 2 points from Dex to Int"));
  // Removing the ancestry takes the moved points back too.
  await P.removeGrants(actor, anc);
  assert.deepEqual([score(actor, "dex"), score(actor, "int")], [18, 16]);
}

// The owner's own pick, and a pick that can't take every point asks again for the rest.
{
  const actor = actorOf(tamla);
  const anc = ancOf(actor, "Elf", { bonuses: { dex: 2, int: 1, con: -1 } });
  const defaults = [];
  DialogV2.wait = async o => {
    if (o.window.title.endsWith("no score above 18")) { defaults.push(o.content.match(/value="(\w+)" selected/)[1]); return null; }
    return { choice: null, picks: [], family: "", scores: true };
  };
  await P.ancestrySetup(actor, anc);
  // Int 16 +1 = 17 has room for 1; the other point goes to the next best, Strength 14.
  assert.deepEqual(defaults, ["int", "str"]);
  assert.deepEqual(["str", "dex", "con", "int"].map(k => score(actor, k)), [15, 18, 3, 18]);
  assert.deepEqual(anc.getFlag("arneyan", "ancestry").applied, { str: 1, dex: 0, con: -1, int: 2 });

  const b = actorOf(tamla);
  const anc2 = ancOf(b, "Test Folk", { bonuses: { dex: 2 } });
  DialogV2.wait = async o => o.window.title.endsWith("no score above 18") ? "wis" : { choice: null, picks: [], family: "", scores: true };
  await P.ancestrySetup(b, anc2);
  assert.deepEqual([score(b, "wis"), score(b, "int")], [13, 16], "both points to the owner's pick");
}

// A Human's two +1s on two 18s: each asks; nothing is lost.
{
  const actor = actorOf({ str: 18, dex: 18, con: 12, int: 10, wis: 15, cha: 9 });
  const anc = ancOf(actor, "Human", { pickTwo: true });
  let asks = 0;
  DialogV2.wait = async o => {
    if (o.window.title.endsWith("no score above 18")) { asks++; return null; }
    return { choice: null, picks: ["str", "dex"], family: "", scores: true };
  };
  await P.ancestrySetup(actor, anc);
  assert.equal(asks, 2);
  assert.equal(score(actor, "wis"), 17, "both points to Wisdom, the next best");
}

// Beyond creation (3rd level), nothing moves and no one is asked: the 20 cap and later increases are as before.
{
  const actor = actorOf(tamla, 3);
  const anc = ancOf(actor, "Test Folk", { bonuses: { dex: 2 } });
  let asks = 0;
  DialogV2.wait = async o => {
    if (o.window.title.endsWith("no score above 18")) { asks++; return null; }
    return { choice: null, picks: [], family: "", scores: true };
  };
  await P.ancestrySetup(actor, anc);
  assert.equal(asks, 0);
  assert.equal(score(actor, "dex"), 20);
}

DialogV2.wait = saved;
console.log("OK chargen");

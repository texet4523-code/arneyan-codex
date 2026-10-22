// 0.10.4 Method V and Starting Scores (Player's Handbook pp. 30-31): the pools, Rule C (two scores of 14 or higher),
// and an ancestry bonus that would take a score past 18 at creation moving to another attribute the owner picks.
// Runs on its own or from test/run.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
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
// 0.10.42: 4d6 six times, dropping the lowest, as a second way to roll.
assert.deepEqual(G.FOUR_D6, ["4d6kh3", "4d6kh3", "4d6kh3", "4d6kh3", "4d6kh3", "4d6kh3"]);
{
  let opts = null;
  DialogV2.wait = async o => { opts = o; return "skip"; };
  await G.abilityScores({ isOwner: true, type: "character", name: "Jack", id: "J4" });
  for (const t of ['value="four"', "Roll 4d6, drop the lowest", "Roll 4d6 six times", "Rule C still applies"]) assert.ok(opts.content.includes(t), t);
}
// Handbook v0.10.6: Rule C applies to the Quick Roll too.
{
  const src = fs.readFileSync(new URL("../arneyan/module/chargen.mjs", import.meta.url), "utf8");
  assert.ok(src.includes("const low = set && !meetsThreshold(set);") && src.includes("!meetsThreshold(four)"));
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

// Beyond creation (3rd level, a character that has had an ancestry before), nothing moves and no one is asked: the
// 20 cap and later increases are as before.
{
  const actor = actorOf(tamla, 3);
  actor.flags = { arneyan: { hadAncestry: true } };
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

// 0.10.14: "the cap applies at any starting level". A 5th-level character's first ancestry is capped and recorded;
// a swap (the old ancestry replaced) at 5th level is not.
{
  const actor = actorOf(tamla, 5);
  actor.flags = { arneyan: { scoresRolled: true } };
  const anc = ancOf(actor, "Test Folk", { bonuses: { dex: 2 } });
  let asks = 0, form = "";
  DialogV2.wait = async o => {
    if (o.window.title.endsWith("no score above 18")) { asks++; return null; }
    form = o.content;
    return { choice: null, picks: [], family: "", scores: true };
  };
  await P.ancestrySetup(actor, anc);
  assert.ok(/name="scores" checked/.test(form), "scores from the scores window: the box starts ticked");
  assert.equal(asks, 1, "asked where the spare points go");
  assert.deepEqual([score(actor, "dex"), score(actor, "int")], [18, 18]);
  assert.ok(actor.updates.some(u => u["flags.arneyan.hadAncestry"] === true), "remembers it has had an ancestry");

  const b = actorOf(tamla, 5);
  const anc2 = ancOf(b, "Test Folk", { bonuses: { dex: 2 } });
  asks = 0;
  await P.ancestrySetup(b, anc2, { replacing: true });
  assert.equal(asks, 0);
  assert.equal(score(b, "dex"), 20, "a swap later follows the 20 cap");

  // Scores typed in by hand for a 5th-level character: the box starts unticked (they may include the bonuses), and
  // the cap still applies if it is ticked.
  const c = actorOf(tamla, 5);
  const anc3 = ancOf(c, "Test Folk", { bonuses: { dex: 2 } });
  asks = 0;
  await P.ancestrySetup(c, anc3);
  assert.ok(!/name="scores" checked/.test(form) && form.includes("Leave this off if the scores already include them") && form.includes("no score can go above 18"));
  assert.equal(asks, 1);
}

// 0.10.8: the bloodline and the family are picked from lists with their text; the +1s and scores box come after.
{
  const actor = actorOf({ str: 10, dex: 12, con: 12, int: 13, wis: 10, cha: 15 });
  const anc = ancOf(actor, "Tiefling", { bonuses: { cha: 2, int: 1, wis: -1 }, family: true,
    traitList: [{ name: "Family", text: "Raised by another people." }, { name: "Hellish Resistance", text: "Fire 5." }],
    choice: { label: "Bloodline", options: [{ name: "Infernal (devils)", text: "Devils.", bonuses: {}, rules: [] }, { name: "Abyssal (demons)", text: "Demons.", bonuses: {}, rules: [] }] } });
  const C = "Compendium.arneyan.ancestries.Item.";
  const index = [{ uuid: `${C}h`, name: "Human", system: { size: "medium", attributes: "+1 / +1" } }, { uuid: `${C}e`, name: "Elf", system: { size: "medium", attributes: "+2 Dex" } },
    { uuid: `${C}t`, name: "Tiefling", system: { size: "medium" } }, { uuid: `${C}g`, name: "Gnome", system: { size: "small" } }];
  const packs = game.packs;
  game.packs = { get: id => (id === "arneyan.ancestries" ? { getIndex: async () => index } : null) };
  const seen = [];
  const pickWith = (o, v) => o.buttons[0].callback(null, { form: { querySelector: () => ({ value: v }) } });
  DialogV2.wait = async o => {
    seen.push(o);
    if (o.window.title === "Tamla: Tiefling bloodline") return pickWith(o, "1");
    if (o.window.title === "Tamla: family") return pickWith(o, "Elf");
    return { picks: [], scores: true };
  };
  await P.ancestrySetup(actor, anc);
  assert.deepEqual(seen.map(o => o.window.title), ["Tamla: Tiefling bloodline", "Tamla: family", "Tamla: Tiefling"]);
  assert.ok(seen[0].content.includes("Abyssal (demons)") && seen[0].content.includes("arn-pick-row"), "bloodlines as picker rows");
  assert.ok(/value="Human"[^>]*checked/.test(seen[1].content), "Human preselected");
  assert.ok(!seen[1].content.includes(`data-name="tiefling"`), "not its own ancestry");
  assert.ok(seen[1].content.indexOf(">Small<") < seen[1].content.indexOf(">Medium<"), "grouped by size");
  assert.ok(seen[2].content.includes("Abyssal (demons)") && seen[2].content.includes("Elf"), "the form says what was picked");
  assert.equal(anc.name, "Tiefling (Abyssal)");
  assert.deepEqual(actor.created.map(c => c.name), ["Family: Elf", "Bloodline: Abyssal (demons)", "Hellish Resistance"]);
  assert.equal(score(actor, "cha"), 17);
  // Choose later: no bloodline, no family, the Family trait stays. Skip and X: nothing set up.
  const b = actorOf({ str: 10, dex: 12, con: 12, int: 13, wis: 10, cha: 15 });
  const anc2 = ancOf(b, "Tiefling", { ...anc.system });
  anc2.name = "Tiefling";
  DialogV2.wait = async o => (o.window.title.endsWith("Tiefling") ? { picks: [], scores: false } : "later");
  await P.ancestrySetup(b, anc2);
  assert.equal(anc2.name, "Tiefling");
  assert.deepEqual(b.created.map(c => c.name), ["Family", "Hellish Resistance"]);
  for (const [answer, ret] of [["skip", "skip"], [null, false]]) {
    const c = actorOf(tamla);
    const anc3 = ancOf(c, "Tiefling", { ...anc.system });
    DialogV2.wait = async () => answer;
    assert.equal(await P.ancestrySetup(c, anc3), ret);
    assert.equal(c.created.length + c.updates.length, 0, `${answer}: nothing set up`);
  }
  game.packs = packs;
}

// 0.10.18: the GM makes a character for a player who owns it: the GM isn't asked for its scores; the player is, the
// first time they open its sheet (once a session). The GM making one with no player owner is asked as before.
{
  const handlers = {};
  const keepHooks = globalThis.Hooks;
  globalThis.Hooks = { on: (n, f) => { handlers[n] = f; }, once: () => {}, call: () => {}, callAll: () => {} };
  G.registerChargen();
  const gm = { id: "gm", isGM: true }, pl = { id: "pl", isGM: false };
  let asked = 0;
  DialogV2.wait = async () => { asked++; return "skip"; };
  const mk = (id, owners) => {
    const flags = {};
    return { id, type: "character", name: id, flags, items: Object.assign([], { size: 0 }), _stats: {},
      system: { abilities: Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(k => [k, { value: 10 }])) },
      isOwner: true, getFlag: (s, k) => flags[k], setFlag: async (s, k, v) => { flags[k] = v; },
      testUserPermission: u => owners.includes(u.id), update: async () => {} };
  };
  game.users = [gm, pl];
  const wait = () => new Promise(r => setTimeout(r, 500));
  // GM makes it, the player already owns it.
  game.user = gm;
  const a = mk("A1", ["gm", "pl"]);
  handlers.createActor(a, {}, "gm");
  await wait();
  assert.equal(asked, 0, "the GM isn't asked");
  assert.equal(a.flags.needsScores, true, "marked as needing scores");
  // The player opens it: asked once.
  game.user = pl;
  handlers.renderActorSheetV2({ document: a });
  await wait();
  assert.equal(asked, 1, "the player is asked");
  handlers.renderActorSheetV2({ document: a });
  await wait();
  assert.equal(asked, 1, "only once a session");
  // Two owning players: only the one whose character it is (else the first by id) is asked.
  const pl2 = { id: "pz", isGM: false };
  game.users = [gm, pl, pl2];
  const c2 = mk("C2", ["gm", "pl", "pz"]);
  game.user = gm; handlers.createActor(c2, {}, "gm"); await wait();
  const askedBefore = asked;
  game.user = pl2; handlers.renderActorSheetV2({ document: c2 }); await wait();
  assert.equal(asked, askedBefore, "the second owner isn't asked");
  pl2.character = { id: "C2" };
  handlers.renderActorSheetV2({ document: c2 }); await wait();
  assert.equal(asked, askedBefore + 1, "the player whose character it is is asked");
  game.users = [gm, pl];
  // GM makes one with no player owner yet: asked as before.
  game.user = gm;
  const b = mk("B1", ["gm"]);
  const beforeB = asked;
  handlers.createActor(b, {}, "gm");
  await wait();
  assert.equal(asked, beforeB + 1, "the GM is asked when no player owns it");
  globalThis.Hooks = keepHooks;
}

// 0.10.18: what an ancestry adds at 1st level, from its own trait texts in the compendium.
{
  const fs = await import("node:fs");
  const anc = name => {
    const dir = new URL("../packs-src/ancestries/", import.meta.url).pathname;
    const d = fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(dir + f))).find(x => x.name === name);
    return { items: [{ type: "ancestry", system: d.system }] };
  };
  const human = P.ancestryExtras(anc("Human"));
  assert.equal(human.bonusFeat, true, "a Human's extra General Path Feat");
  assert.deepEqual(human.knack, { what: "", abilities: [] }, "and a Knack of any skill");
  assert.deepEqual(P.ancestryExtras(anc("Aasimar")).knack.abilities, ["wis", "cha"], "Aasimar: a Wisdom or Charisma skill");
  assert.deepEqual(P.ancestryExtras(anc("Dwarf")).knack, { what: "Craft", abilities: [] }, "Dwarf: a Craft skill (the GM checks)");
  assert.equal(P.ancestryExtras(anc("Dwarf")).bonusFeat, false);
  assert.equal(P.ancestryExtras(anc("Half-Elf")).knack.what, "", "'one additional skill': any");
  assert.deepEqual(P.ancestryExtras({ items: [] }), { bonusFeat: false, knack: null }, "no ancestry: nothing extra");
}
// A Knack takes no Skill slot; Trained one, Master two.
{
  const D = await import("../arneyan/module/documents.mjs");
  const plan = D.planSkills({ items: [], system: { nwp: { used: 3, max: 3 } } }, [{ name: "Swimming", system: { tier: "knack" } }, { name: "Riding", system: { tier: "trained" } }]);
  assert.deepEqual([plan.fit.map(d => d.name), plan.over.map(d => d.name)], [["Swimming"], ["Riding"]], "the Knack fits with every slot used");
}

// 0.10.18: a feat that raises max HP (Toughness, +1 a level) taken while making or levelling a character raises
// current HP as much (it used to leave a gap that grew each level).
{
  const keep = globalThis.fromUuid;
  globalThis.fromUuid = async () => ({ type: "feat", toObject: () => ({ _id: "x", name: "Toughness", type: "feat", system: {} }) });
  const ups = [];
  const a = { type: "character", system: { attributes: { hp: { value: 30, max: 30 } } },
    createEmbeddedDocuments: async () => { a.system.attributes.hp.max = 35; return [{}]; },
    update: async d => { ups.push(d); a.system.attributes.hp.value = d["system.attributes.hp.value"]; } };
  await P.addFromUuid(a, "Compendium.arneyan.feats.Item.t", { levelTaken: 5 });
  assert.equal(a.system.attributes.hp.value, 35, "current HP rises with the maximum");
  ups.length = 0;
  a.createEmbeddedDocuments = async () => [{}];
  await P.addFromUuid(a, "Compendium.arneyan.feats.Item.t");
  assert.equal(ups.length, 0, "no change to the maximum: nothing to do");
  globalThis.fromUuid = keep;
}

DialogV2.wait = saved;
console.log("OK chargen");

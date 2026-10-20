// 0.10.2 review fixes: feats' level taken, starting gold once (GM reruns, running total, no double freebies, packs
// paid from gp/pp/sp), toolkits in Tools & Trades, GM-allowed skill slots kept, compendium links, skill batches,
// refused Master redraws the sheet, the level-up skill slot isn't lost, first-level setup and starting gold, labels,
// and reactions in the encounter the creature is in (not the tracker's). Runs on its own or from test/run.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeItem, makeActor } from "./harness.mjs";

const root = new URL("../arneyan/", import.meta.url).pathname;
const packDocs = dir => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));

/* ---------------- Foundry stand-ins ---------------- */
for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
const chat = [], warnings = [], infos = [];
globalThis.ChatMessage = { create: async m => { chat.push(m); return m; }, getSpeaker: () => ({}) };
globalThis.ui = { notifications: { warn: m => warnings.push(m), info: m => infos.push(m), error: m => warnings.push(m) } };
let nextRoll = 30;
globalThis.Roll = class { constructor(f) { this.formula = f; } async evaluate() { this.total = nextRoll; return this; } async toMessage() { return null; } };
game.user.id ??= "u1";
const setGM = v => { game.user.isGM = v; };
const DialogV2 = foundry.applications.api.DialogV2;

const IM = await import("../arneyan/module/data/item-models.mjs");
const { CharacterData } = await import("../arneyan/module/data/actor-models.mjs");
const D = await import("../arneyan/module/documents.mjs");
const S = await import("../arneyan/module/starting.mjs");
const P = await import("../arneyan/module/progression.mjs");
const F = await import("../arneyan/module/fight.mjs");
const C = await import("../arneyan/module/combat.mjs");

// The mocked Item base has none of Foundry's hooks: give it empty ones so the system's overrides can call super.
const ItemBase = Object.getPrototypeOf(D.ArneyanItem);
ItemBase.prototype._preCreate ??= async () => {};
ItemBase.prototype._preUpdate ??= async () => {};
ItemBase._preCreateOperation ??= async () => {};

/** A character as the document code sees it: items collection, flags, updates and creations recorded. */
function pc({ level = 1, items = [], flags = {}, currency = {}, nwp = { used: 0, max: 3 } } = {}) {
  const a = Object.create(Actor.prototype);
  const coll = [...items];
  coll.get = id => coll.find(i => i.id === id);
  coll.has = id => coll.some(i => i.id === id);
  Object.assign(a, {
    id: "A1", name: "Tess", type: "character", isOwner: true, items: coll, flags: { arneyan: { ...flags } }, created: [], updates: [],
    system: { level, currency: { pp: 0, gp: 0, sp: 0, cp: 0, ...currency }, nwp: { ...nwp }, nwpBonus: 0, abilities: { con: { mod: 0 } } },
    _source: { system: { nwpBonus: 0 } },
    getFlag(s, k) { return this.flags[s]?.[k]; },
    async setFlag(s, k, v) { (this.flags[s] ??= {})[k] = v; },
    async update(d) {
      this.updates.push(d);
      for (const [k, v] of Object.entries(d)) foundry.utils.setProperty(this, k, v);
      if ("system.nwpBonus" in d) { this._source.system.nwpBonus = d["system.nwpBonus"]; this.system.nwp.max += d["system.nwpBonus"] - (this._prevBonus ?? 0); this._prevBonus = d["system.nwpBonus"]; }
    },
    async createEmbeddedDocuments(type, data) { this.created.push(...data); return data; }
  });
  return a;
}
/** An ArneyanItem on (or arriving on) an actor. */
function doc(type, name, system = {}, parent = null, id = null) {
  const it = Object.create(D.ArneyanItem.prototype);
  Object.assign(it, { type, name, system: foundry.utils.deepClone(system), parent, id, flags: {}, apps: {} });
  it.updateSource = d => { for (const [k, v] of Object.entries(d)) foundry.utils.setProperty(it, k, v); };
  return it;
}

/* ---------------- 1. A feat records the level it was taken at ---------------- */
{
  assert.equal(new IM.FeatData({}).levelTaken, 0, "the default is 0 (not known)");
  const feats = packDocs("feats").filter(d => d.type === "feat");
  assert.ok(feats.length && feats.every(d => d.system.levelTaken === 0), "compendium feats carry no level taken");
  // Pregens: the level from the book where it's given, else 0.
  const pregens = packDocs("pregens").filter(d => d.type === "character");
  const featOf = (who, f) => pregens.find(p => p.name === who)?.items.find(i => i.type === "feat" && i.name === f)?.system.levelTaken;
  assert.equal(featOf("Marta Holloway", "Critical Strike"), 6);
  assert.equal(featOf("Marta Holloway", "Swift Reflexes"), 1, "a Human's bonus feat: 1st level");
  assert.equal(featOf("Maud Hollins", "Expanded Mind"), 0, "'One extra 2nd-level slot' isn't the level taken");
  assert.equal(featOf("Wendel \"Big Wen\" Harrow", "Critical Strike"), 1, "a 1st-level pregen took everything at 1st");
  // Stamped with the character's level when it's new to the character.
  const actor = pc({ level: 5 });
  const feat = doc("feat", "Toughness", { levelTaken: 0 }, actor);
  await feat._preCreate({}, {}, game.user);
  assert.equal(feat.system.levelTaken, 5);
  const moved = doc("feat", "Alertness", { levelTaken: 2 }, actor);
  await moved._preCreate({}, { arneyanKeepLevel: true }, game.user);
  assert.equal(moved.system.levelTaken, 2, "the option keeps the level it has");
  const restamp = doc("feat", "Alertness", { levelTaken: 1 }, actor);
  await restamp._preCreate({}, {}, game.user);
  assert.equal(restamp.system.levelTaken, 5, "a compendium feat's stored 1 doesn't stop the stamp");
  const arriving = doc("feat", "Old", { levelTaken: 3 }, pc({ level: 9, items: [{ id: "f1", type: "feat" }] }), "f1");
  await arriving._preCreate({}, {}, game.user);
  assert.equal(arriving.system.levelTaken, 3, "arriving with its actor (import, duplicate): left as it is");
  // Shown only when known.
  assert.equal(doc("feat", "X", { path: "Martial Path", levelTaken: 0 }).levelLabel, "Feat · Martial Path");
  assert.equal(doc("feat", "X", { path: "Martial Path", levelTaken: 4 }).levelLabel, "Feat · Martial Path · taken at level 4");
  // The feat row: "taken at level N" only when N is above 0 (Handlebars' #if treats 0 as false).
  const tpl = fs.readFileSync(`${root}templates/actor/actor-sheet.hbs`, "utf8");
  const row = tpl.match(/\{\{item\.system\.path\}\}.*?taken at level \{\{item\.system\.levelTaken\}\}\{\{\/if\}\}/)?.[0];
  assert.ok(row, "the feat row's meta");
  const H = (await import("handlebars")).default;
  assert.equal(H.compile(row)({ item: { system: { path: "General Path", levelTaken: 0 } } }), "General Path");
  assert.equal(H.compile(row)({ item: { system: { path: "General Path", levelTaken: 3 } } }), "General Path · taken at level 3");
}

/* ---------------- Labels: ancestry traits and custom abilities ---------------- */
{
  assert.equal(doc("ability", "Keen Senses", { kind: "ancestry", level: 1, className: "Elf (High)" }).levelLabel, "Ancestry trait");
  assert.equal(doc("ability", "My trick", { kind: "other", level: 1, className: "" }).levelLabel, "", "no class: no 'Level 1'");
  assert.equal(doc("ability", "Turn Undead", { kind: "class", level: 2, className: "Cleric" }).levelLabel, "Cleric · Level 2");
}

/* ---------------- 2. Starting gold: once for players, a running total, no double freebies ---------------- */
{
  const cls = { type: "class", name: "Gunslinger", system: {} };
  const gun = { _id: "g", name: "Pistol", uuid: "Compendium.arneyan.equipment.Item.g", system: { quantity: 1 } };
  const docs = { [gun.uuid]: gun };
  globalThis.fromUuid = async u => (docs[u] ? { ...docs[u], toObject() { return foundry.utils.deepClone(docs[u]); } } : null);
  game.packs = { get: k => (k === "arneyan.equipment" ? { getIndex: async () => Object.values(docs).map(d => ({ name: d.name, uuid: d.uuid })) } : null) };
  const { ArneyanBrowser } = await import("../arneyan/module/browser.mjs");
  ArneyanBrowser.open = () => null;

  setGM(false);
  const actor = pc({ items: [cls], currency: { gp: 0 } });
  assert.equal(S.canRunStartingWealth(actor, game.user), true, "not rolled yet: the player can");
  let asked = [];
  DialogV2.wait = async o => { asked.push(o); return o.buttons[0].action === "roll" ? "roll" : o.buttons[0].callback(null, { form: { querySelector: () => ({ value: "shop" }), elements: { gun: { value: "Pistol" } } } }); };
  nextRoll = 40;
  await S.startingWealth(actor, cls);
  assert.equal(actor.flags.arneyan.startingGold, 40);
  assert.equal(actor.system.currency.gp, 40);
  assert.deepEqual(actor.flags.arneyan.startingGear.free, ["Pistol"], "the free firearm is recorded");
  assert.equal(actor.created[0]._stats.compendiumSource, gun.uuid, "giveItems links the copy to the Catalogue");
  assert.equal(S.canRunStartingWealth(actor, game.user), false, "rolled: the player can't run it again");
  asked = []; warnings.length = 0;
  await S.startingWealth(actor, cls);
  assert.equal(asked.length, 0, "no window for the player");
  assert.ok(warnings[0].includes("already rolled"), warnings[0]);

  // The GM reruns it: gold adds to the total, the firearm isn't offered or given again, and the window says so.
  setGM(true);
  assert.equal(S.canRunStartingWealth(actor, game.user), true);
  nextRoll = 25; asked = []; actor.created.length = 0;
  await S.startingWealth(actor, cls);
  assert.equal(actor.flags.arneyan.startingGold, 65, "a running total of the gold rolled");
  assert.equal(actor.system.currency.gp, 65);
  assert.ok(asked[0].content.includes("Already rolled: 40 gp") && asked[0].content.includes("aren't given again"), asked[0].content);
  assert.ok(!asked[1].content.includes('name="gun"'), "no second free firearm");
  assert.ok(asked[1].content.includes("Free items already taken: Pistol"));
  assert.equal(actor.created.length, 0, "nothing given twice");

  // Sheet button: hidden for players once rolled.
  const tpl = fs.readFileSync(`${root}templates/actor/actor-sheet.hbs`, "utf8");
  assert.ok(tpl.includes('{{#if canStartingGold}}<a class="arn-btn small ghost" data-action="startingGold"'));

  // Packs paid from gold, then platinum, then silver, with change.
  assert.deepEqual(S.payGp({ gp: 40, pp: 1, sp: 5 }, 36), { gp: 4, pp: 1, sp: 5 }, "gold first");
  assert.deepEqual(S.payGp({ gp: 5, pp: 4, sp: 0 }, 36), { gp: 9, pp: 0, sp: 0 }, "then platinum, change in gold");
  assert.deepEqual(S.payGp({ gp: 0, pp: 0, sp: 80 }, 8), { gp: 0, pp: 0, sp: 0 }, "then silver");
  assert.deepEqual(S.payGp({ gp: 2, pp: 0, sp: 70 }, 8), { gp: 0, pp: 0, sp: 10 }, "gold, then the rest in silver");
  assert.equal(S.payGp({ gp: 3, pp: 0, sp: 9 }, 8), null, "short");
  assert.equal(S.purseGp({ pp: 2, gp: 3, sp: 15 }), 24.5);
  // A pack bought from platinum, through the window's last step.
  const buyer = pc({ items: [{ type: "class", name: "Fighter", system: {} }], currency: { gp: 1, pp: 1, sp: 0 } });
  chat.length = 0;
  await S.applyStartingGear(buyer, { pick: "1", gun: "" }, { gun: false, toolkit: null, taken: [] });
  assert.equal(S.STARTING_PACKS[1].gp, 8);
  assert.deepEqual([buyer.system.currency.pp, buyer.system.currency.gp], [0, 3], "8 gp: 1 gp, then a pp with 3 gp change");
  assert.deepEqual(buyer.flags.arneyan.startingGear.packs, ["Dungeoneer's Pack"]);
  // Every freebie missing from the Catalogue: still a chat line.
  const art = pc({ items: [{ type: "class", name: "Artificer", system: {} }] });
  chat.length = 0;
  const lines = await S.applyStartingGear(art, { pick: "shop", gun: "" }, { gun: false, toolkit: "Infuser's Toolkit", taken: [] });
  assert.ok(lines.length === 1 && chat.length === 1 && chat[0].content.includes("couldn't find Infuser&#39;s Toolkit in the Catalogue"), chat[0]?.content);
  assert.equal(art.flags.arneyan.startingGear, undefined, "nothing taken, nothing recorded");
}

/* ---------------- 3. Toolkits in Tools & Trades on a clean build ---------------- */
{
  const eq = packDocs("equipment");
  const folders = Object.fromEntries(eq.filter(d => d._key.startsWith("!folders!")).map(d => [d._id, d.name]));
  const kits = eq.filter(d => /(Toolkit|'s Tools)$/.test(d.name) && d.system?.source?.page === 41);
  assert.equal(kits.length, 18);
  for (const k of kits) assert.equal(folders[k.folder], "Tools & Trades", `${k.name} is in ${folders[k.folder] ?? "the root"}`);
}

/* ---------------- 5. "Add it anyway" is kept as extra slots ---------------- */
{
  const s = makeActor(CharacterData, "character", { nwpBonus: 2 }, [makeItem(IM.ClassData, "class", "Fighter", { levels: 1 })]).system;
  assert.equal(s.nwp.max, 3 + 2, "the GM's extra slots count towards the maximum");
  assert.equal(s.nwp.extra, 2);
  setGM(true);
  const actor = pc({ nwp: { used: 3, max: 3 } });
  DialogV2.confirm = async () => true;
  assert.equal(await D.skillSlotOk(actor, 2, "Riding", game.user), true);
  assert.equal(actor.system.nwpBonus, 2, "two extra slots kept");
  assert.equal(actor.system.nwp.max, 5, "and counted");
  assert.equal(await D.skillSlotOk(actor, 2, "Riding", game.user), true, "the kept slots are used without asking again");
  actor.system.nwp.used = 5;
  assert.equal(await D.skillSlotOk(actor, 1, "Swimming", game.user), true);
  assert.equal(actor.system.nwpBonus, 3, "added to, not replaced");
  DialogV2.confirm = async () => false;
  actor.system.nwp.used = 6;
  const before = actor.updates.length;
  assert.equal(await D.skillSlotOk(actor, 1, "Climbing", game.user), false);
  assert.equal(actor.updates.length, before, "refused: nothing kept");
  setGM(false); warnings.length = 0;
  assert.equal(await D.skillSlotOk(pc({ nwp: { used: 3, max: 3 } }), 1, "Riding", game.user), false, "a player is stopped");
  assert.ok(warnings[0].includes("Ask the GM"));
}

/* ---------------- Several skills in one call are checked together ---------------- */
{
  const have = { id: "s0", type: "skill", name: "Swimming", system: { tier: "trained" } };
  const actor = pc({ items: [have], nwp: { used: 1, max: 3 } });
  const batch = [doc("skill", "Riding", { tier: "trained" }), doc("skill", "Riding", { tier: "trained" }), doc("skill", "Swimming", { tier: "trained" }),
    doc("skill", "Climbing", { tier: "trained" }), doc("skill", "Tracking", { tier: "trained" })];
  const plan = D.planSkills(actor, batch);
  assert.deepEqual(plan.dupes.map(d => d.name), ["Riding", "Swimming"], "the second Riding and the one already known");
  assert.deepEqual(plan.fit.map(d => d.name), ["Riding", "Climbing"]);
  assert.deepEqual(plan.over.map(d => d.name), ["Tracking"]);
  // A player: duplicates and the one over the limit are left out, the rest go in.
  setGM(false); warnings.length = 0;
  const docs = [...batch];
  await D.ArneyanItem._preCreateOperation(docs, { parent: actor }, game.user);
  assert.deepEqual(docs.map(d => d.name), ["Riding", "Climbing"]);
  assert.ok(warnings.some(w => w.includes("already has Riding, Swimming")) && warnings.some(w => w.includes("Ask the GM")), warnings.join(" | "));
  // The GM allows the lot: asked once, and the extra slot is kept.
  setGM(true);
  let asks = 0;
  DialogV2.confirm = async () => { asks++; return true; };
  const gmActor = pc({ items: [have], nwp: { used: 1, max: 3 } });
  const docs2 = [doc("skill", "Riding", { tier: "trained" }), doc("skill", "Climbing", { tier: "master" })];
  await D.ArneyanItem._preCreateOperation(docs2, { parent: gmActor }, game.user);
  assert.equal(docs2.length, 2);
  assert.equal(asks, 1);
  assert.equal(gmActor.system.nwpBonus, 1, "1 used + 1 + 2 (Master) = 4 of 3: one extra slot");
  // Level-up grants aren't checked.
  const docs3 = [doc("skill", "Swimming", {})];
  await D.ArneyanItem._preCreateOperation(docs3, { parent: actor, arneyanGrant: true }, game.user);
  assert.equal(docs3.length, 1);
}

/* ---------------- Refused Master redraws the item sheet ---------------- */
{
  setGM(false);
  const actor = pc({ nwp: { used: 3, max: 3 } });
  const sk = doc("skill", "Riding", { tier: "trained" }, actor, "s1");
  let drawn = 0;
  sk.apps = { a: { rendered: true, render: () => { drawn++; } } };
  sk._sheet = sk.apps.a;
  assert.equal(await sk._preUpdate({ system: { tier: "master" } }, {}, game.user), false);
  assert.equal(drawn, 1, "the sheet is drawn again so its select goes back");
}

/* ---------------- 6. addFromUuid links to the compendium; the level-up slot isn't lost ---------------- */
{
  const skill = { _id: "k", name: "Riding", type: "skill", uuid: "Compendium.arneyan.skills.Item.k", system: { tier: "trained" } };
  globalThis.fromUuid = async u => (u === skill.uuid ? { ...skill, toObject() { return foundry.utils.deepClone(skill); } } : null);
  const actor = pc();
  await P.addFromUuid(actor, skill.uuid);
  assert.equal(actor.created[0]._stats.compendiumSource, skill.uuid);
  assert.equal(actor.created[0]._id, undefined);

  game.packs = { get: () => null };
  const answers = [{ skill: "" }, { skill: skill.uuid }];
  let opened = 0;
  DialogV2.wait = async () => { opened++; return answers.shift(); };
  warnings.length = 0; actor.created.length = 0;
  await P.promptSkill(actor, 4);
  assert.equal(opened, 2, "Confirm with nothing picked: asked again");
  assert.ok(warnings[0].includes("Choose later"));
  assert.equal(actor.created.length, 1);
  DialogV2.wait = async () => "later";
  opened = 0;
  await P.promptSkill(actor, 4);
}

/* ---------------- First-level setup: X stops, Skip and Apply go on to starting gold, outside the lock ---------------- */
{
  setGM(true);
  game.packs = { get: () => null };
  const mk = () => {
    const cls = { id: "c1", type: "class", name: "Fighter", system: { hitDie: "d10", levels: 0, features: [] }, getFlag: () => null,
      async update(d) { for (const [k, v] of Object.entries(d)) foundry.utils.setProperty(this, k, v); } };
    const anc = { id: "an", type: "ancestry", name: "Human", getFlag: () => null };
    return { cls, actor: pc({ items: [cls, anc] }) };
  };
  let titles = [];
  // Closed with X: no starting gold window.
  let { cls, actor } = mk();
  DialogV2.wait = async o => { titles.push(o.window.title); return null; };
  await P.firstLevelSetup(actor, cls);
  assert.deepEqual(titles, ["Tess: 1st-level Fighter"]);
  // Skip: on to starting gold, and a level change works while that window is open.
  ({ cls, actor } = mk());
  titles = []; warnings.length = 0;
  let duringGold = null;
  DialogV2.wait = async o => {
    titles.push(o.window.title);
    if (o.window.title.endsWith("starting gold")) { duringGold = await P.setClassLevel(actor, cls, 1); return "skip"; }
    return "skip";
  };
  await P.firstLevelSetup(actor, cls);
  assert.deepEqual(titles, ["Tess: 1st-level Fighter", "Tess: starting gold"]);
  assert.notEqual(duringGold, false, "not locked out while the gold window is open");
  assert.ok(!warnings.some(w => w.includes("Finish the current level change")), warnings.join(" | "));
}

/* ---------------- Reactions in the encounter the creature is in ---------------- */
{
  const actor = { id: "a1", name: "Guard", uuid: "Actor.a1" };
  const flags = {};
  const mine = { actor, isOwner: true, getFlag: (s, k) => flags[k], setFlag: async (s, k, v) => { flags[k] = v; } };
  const other = { id: "c-other", started: false, active: true, scene: { id: "s2" }, combatants: [] };
  const fight = { id: "c-fight", started: true, active: false, scene: { id: "s1" }, round: 3, combatants: [mine] };
  game.combat = other;
  game.combats = [other, fight];
  assert.equal(F.combatFor(actor), fight, "the running encounter it's in, not the tracker's");
  assert.deepEqual(F.combatantsOf(actor), [mine]);
  assert.equal(F.combatById("c-fight"), fight);
  await C.spendReaction(actor, "Attack of Opportunity");
  assert.equal(flags.reacted, true, "spent");
  warnings.length = 0;
  await C.spendReaction(actor, "Attack of Opportunity");
  assert.ok(warnings[0]?.includes("already used its reaction"), "and warned the second time");
  // Two running encounters with the creature in both: the viewed scene's is the one.
  const here = { id: "c-here", started: true, scene: { id: "s9" }, combatants: [{ ...mine }] };
  game.combats = [fight, here];
  globalThis.canvas = { scene: { id: "s9" } };
  assert.equal(F.combatFor(actor), here);
  assert.equal(F.combatantsOf(actor, { all: true }).length, 2, "defeated marks go to every encounter");
  delete globalThis.canvas;
  game.combat = null;
  game.combats = [];
}

setGM(true);
console.log("OK review 0.10.2");

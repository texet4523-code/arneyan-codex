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
  assert.equal(featOf("Marten Halloway", "Point-Blank Terror"), 2);
  assert.equal(featOf("Marten Halloway", "Swift Reflexes"), 6);
  assert.equal(featOf("Marten Halloway", "Toughness"), 1, "a Human's bonus feat: 1st level");
  assert.equal(featOf("Haldor Brassbeard", "Toughness"), 1, "a 1st-level pregen took everything at 1st");
  // A feat note naming a level that isn't when it was taken ("One extra 2nd-level slot", Maud's Expanded Mind before the
  // Journeymen were cut) stays 0: build_pregens.py's feat_level, checked directly.
  {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync("python3", ["-c", "import sys; sys.path.insert(0, 'build'); import build_pregens as b; print(b.feat_level({'note': 'One extra 2nd-level slot'}, 5), b.feat_level({'note': 'Martial, 2nd'}, 5), b.feat_level({'note': 'Human bonus feat'}, 5))"], { cwd: new URL("..", import.meta.url).pathname }).toString().trim();
    assert.equal(out, "0 2 1", "feat levels from notes");
  }
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

  // The level-up skill slot is a browser-style picker (picker.mjs): Take with nothing chosen asks again.
  game.packs = { get: () => ({ getIndex: async () => [{ name: "Riding", uuid: skill.uuid, system: { ability: "dex" } }] }) };
  const answers = ["", skill.uuid];
  let opened = 0, content = "";
  DialogV2.wait = async o => { opened++; content = o.content; return answers.shift(); };
  warnings.length = 0; actor.created.length = 0;
  await P.promptSkill(actor, 4);
  assert.equal(opened, 2, "Take with nothing picked: asked again");
  assert.ok(warnings[0].includes("Choose later"));
  assert.ok(content.includes("arn-pick-row") && content.includes("Riding"), "skills listed as picker rows");
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

/* ---------------- The encounter the creature is in ---------------- */
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
  assert.equal(C.spendReaction, undefined, "no reaction tracking (removed 0.10.16)");
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

/* ---------------- 0.10.7: a Feat taken for level 3 during a 1 to 4 jump records 3 ---------------- */
{
  const feat = { _id: "f", name: "Diehard", type: "feat", uuid: "Compendium.arneyan.feats.Item.f", system: { path: "General Path", levelTaken: 0 } };
  globalThis.fromUuid = async u => (u === feat.uuid ? { ...feat, uuid: feat.uuid, toObject() { return foundry.utils.deepClone(feat); } } : null);
  const actor = pc(); let opts = null;
  const orig = actor.createEmbeddedDocuments?.bind(actor);
  actor.createEmbeddedDocuments = async (t, d, o) => { opts = o; return orig ? orig(t, d, o) : d; };
  await P.addFromUuid(actor, feat.uuid, { levelTaken: 3 });
  assert.equal(actor.created.at(-1).system.levelTaken, 3);
  assert.equal(opts?.arneyanKeepLevel, true);
  console.log("OK feat level taken (0.10.7)");
}

/* ---------------- 0.10.8: the picker picks several; the new-character steps use it ---------------- */
const PK = await import("../arneyan/module/picker.mjs");
const take = (o, vals) => o.buttons[0].callback(null, { form: {
  querySelectorAll: () => vals.map(value => ({ value })), querySelector: () => (vals[0] != null ? { value: vals[0] } : null),
  elements: { luck: { checked: true } } } });
{
  const entries = ["a", "b", "c", "d"].map(v => ({ value: v, name: v.toUpperCase(), group: "G" }));
  // Several: tick boxes, a counter, Take with none ticked asks again, fewer than the most is allowed with a warning.
  let seen = [], answers = [[], ["a", "b"]];
  DialogV2.wait = async o => { seen.push(o); return take(o, answers.shift()); };
  warnings.length = 0;
  assert.deepEqual(await PK.pickFromList({ title: "T", step: "Step 3 of 4", entries, max: 3, preselect: ["c"], skipLabel: "Skip" }), ["a", "b"]);
  assert.equal(seen.length, 2, "nothing ticked: asked again");
  assert.equal(seen[0].window.title, "T (Step 3 of 4)");
  assert.ok(seen[0].content.includes('type="checkbox"') && seen[0].content.includes("1 of 3 chosen"), "boxes and a counter");
  assert.ok(/value="c" aria-label="Choose C" checked/.test(seen[0].content), "preselected");
  assert.deepEqual(seen[0].buttons.map(b => b.action), ["take", "later", "skip"]);
  assert.ok(warnings[0].includes("Pick at least one") && warnings[1].includes("2 of 3 chosen"), warnings.join(" | "));
  // Too many: only the most are kept. Exact: fewer asks again, keeping the ticks.
  seen = []; answers = [["a", "b", "c", "d"]];
  assert.deepEqual(await PK.pickFromList({ title: "T", entries, max: 3 }), ["a", "b", "c"]);
  seen = []; answers = [["a"], ["a", "b", "c"]];
  assert.deepEqual(await PK.pickFromList({ title: "T", entries, max: 3, exact: true }), ["a", "b", "c"]);
  assert.equal(seen.length, 2);
  assert.ok(/value="a" aria-label="Choose A" checked/.test(seen[1].content), "the first tick kept");
  // One: as before (radio rows); an entry's own text, footer buttons, later, skip and closed.
  seen = [];
  DialogV2.wait = async o => { seen.push(o); return "skip"; };
  assert.equal(await PK.pickFromList({ title: "T", entries: [{ value: "0", name: "Fire", html: "<p>Hot</p>" }], preselect: "0", skipLabel: "Skip", buttons: [{ action: "back", label: "Back" }] }), "skip");
  assert.equal(seen[0].window.title, "T", "no step: title as given");
  assert.ok(/type="radio" name="pick" value="0" checked/.test(seen[0].content));
  assert.deepEqual(seen[0].buttons.map(b => b.action), ["take", "later", "skip", "back"]);
  DialogV2.wait = async () => null;
  assert.equal(await PK.pickFromList({ title: "T", entries }), null);
  DialogV2.wait = async () => "later";
  assert.equal(await PK.pickFromList({ title: "T", entries, max: 2 }), "later");
}

{
  setGM(true);
  const C8 = "Compendium.arneyan.";
  const kit = { uuid: `${C8}kits.Item.k1`, name: "The Heavy Hand (Fighter)", type: "kit", system: { className: "Fighter" } };
  const deity = { uuid: `${C8}kits.Item.k2`, name: "Deity: Bane (Fighter)", type: "kit", system: { className: "Fighter" } };
  const other = { uuid: `${C8}kits.Item.k3`, name: "Sneak (Rogue)", type: "kit", system: { className: "Rogue" } };
  const feat = { uuid: `${C8}feats.Item.f1`, name: "Diehard", type: "feat", system: { path: "General Path" } };
  const sk = [["Riding", "dex"], ["Swimming", "str"], ["Lore", "int"], ["Climbing", "str"]].map(([name, ability], i) => ({ uuid: `${C8}skills.Item.s${i}`, name, type: "skill", system: { ability } }));
  const elf = { uuid: `${C8}ancestries.Item.a1`, name: "Elf", type: "ancestry", system: { size: "medium", attributes: "+2 Dex", bonuses: {}, traitList: [],
    choice: { label: "Subtype", options: [{ name: "High Elf", text: "Arcane Sense.", bonuses: {}, rules: [] }, { name: "Saevren (Wood Elf)", text: "Camouflage.", bonuses: {}, rules: [] }] } } };
  const gnome = { uuid: `${C8}ancestries.Item.a2`, name: "Gnome", type: "ancestry", system: { size: "small", attributes: "+2 Int" } };
  const all = [kit, deity, other, feat, ...sk, elf, gnome];
  globalThis.fromUuid = async u => { const d = all.find(x => x.uuid === u); return d ? { ...d, toObject() { const o = foundry.utils.deepClone(d); delete o.uuid; return o; } } : null; };
  const index = { "arneyan.kits": [kit, deity, other], "arneyan.feats": [feat], "arneyan.skills": sk, "arneyan.ancestries": [elf, gnome] };
  game.packs = { get: id => (index[id] ? { getIndex: async () => index[id] } : null) };
  const mk = (withAncestry = true) => {
    const cls = { id: "c1", type: "class", name: "Fighter", system: { hitDie: "d10", levels: 0, features: [] }, getFlag: () => null,
      async update(d) { for (const [k, v] of Object.entries(d)) foundry.utils.setProperty(this, k, v); } };
    const items = [cls];
    if (withAncestry) items.push({ id: "an", type: "ancestry", name: "Human", getFlag: () => null });
    const actor = pc({ items });
    actor.system.luck = { value: 0, start: 0 };
    return { cls, actor };
  };
  const answer = (o, how) => {
    const t = o.window.title;
    const key = t.endsWith("starting gold") ? "gold" : /Kit/.test(t) ? "kit" : /Feat/.test(t) ? "feat" : /Skills/.test(t) ? "skills" : /1st-level Fighter/.test(t) ? "finish" : "other";
    const a = how[key];
    if (typeof a === "function") return a(o);
    return a === undefined ? "skip" : a;
  };

  // Every step: Kit taken, Feat later, three Skills, Apply with Luck; added before starting gold.
  let { cls, actor } = mk();
  let seen = [], atGold = -1;
  DialogV2.wait = async o => { seen.push(o); if (o.window.title.endsWith("starting gold")) atGold = actor.created.length; return answer(o, {
    kit: o => take(o, [kit.uuid]), feat: "later", skills: o => take(o, sk.slice(0, 3).map(s => s.uuid)), finish: o => take(o, ["roll"]) }); };
  nextRoll = 13;
  assert.equal(await P.firstLevelSetup(actor, cls), "gold");
  assert.deepEqual(seen.map(o => o.window.title), ["Tess: Fighter Kit (Step 1 of 4)", "Tess: 1st-level Feat (Step 2 of 4)",
    "Tess: starting Skills (Step 3 of 4)", "Tess: 1st-level Fighter (Step 4 of 4)", "Tess: starting gold"]);
  assert.ok(seen[0].content.includes("Max HP is set to <strong>10</strong>"), "the HP line heads step 1");
  assert.ok(!seen[1].content.includes("Max HP is set"), "and only step 1");
  assert.ok(seen[0].content.includes('arn-pick-group">Deity<') && seen[0].content.includes(">Bane<") && seen[0].content.includes(">The Heavy Hand<"), "kits grouped, class name dropped");
  assert.ok(!seen[0].content.includes("Sneak"), "only this class's kits");
  const sc = seen[2].content;
  assert.ok(sc.includes('type="checkbox"') && sc.includes("0 of 3 chosen"), "skills: pick three");
  assert.ok(sc.indexOf(">Strength<") < sc.indexOf(">Dexterity<") && sc.indexOf(">Dexterity<") < sc.indexOf(">Intelligence<"), "grouped by attribute in sheet order");
  assert.ok(seen[3].content.includes("The Heavy Hand") && seen[3].content.includes("Riding, Swimming, Lore"), "the last step lists the choices");
  assert.deepEqual(actor.created.map(c => c.name), ["The Heavy Hand (Fighter)", "Riding", "Swimming", "Lore"]);
  assert.equal(actor.created[0]._stats.compendiumSource, kit.uuid);
  assert.equal(atGold, 4, "the kit and skills are on before starting gold (an Artificer's toolkit follows the kit)");
  assert.equal(actor.system.luck.start, 13, "Starting Luck rolled");
  assert.equal(actor.system.attributes.hp.max, 10);

  // 0.10.22: while the steps run, a class feature's own question (Weapon Specialisation) waits for them to end.
  ({ cls, actor } = mk());
  let during = null;
  DialogV2.wait = async o => { during ??= P.firstLevelSetupRunning(actor); return answer(o, { kit: "later", feat: "later", skills: "later", finish: o => take(o, []) }); };
  assert.equal(P.firstLevelSetupRunning(actor), null, "nothing running before");
  const run = P.firstLevelSetup(actor, cls);
  await run;
  assert.ok(during instanceof Promise, "a promise while the steps are open");
  assert.equal(await Promise.race([during.then(() => "settled"), new Promise(r => setTimeout(() => r("pending"), 50))]), "settled", "settled once they're over");
  assert.equal(P.firstLevelSetupRunning(actor), null);
  // A second setup for the same character while one runs is refused, and leaves the first one's promise in place.
  ({ cls, actor } = mk());
  let second = "unset", stillMine = null;
  const warn = ui.notifications.warn; ui.notifications.warn = () => {};
  DialogV2.wait = async o => {
    if (second === "unset") { const first = P.firstLevelSetupRunning(actor); second = await P.firstLevelSetup(actor, cls); stillMine = P.firstLevelSetupRunning(actor) === first; }
    return answer(o, { kit: "later", feat: "later", skills: "later", finish: o => take(o, []) });
  };
  await P.firstLevelSetup(actor, cls);
  ui.notifications.warn = warn;
  assert.equal(second, false, "the second is refused");
  assert.ok(stillMine, "the first one's promise is still the one waited on");
  assert.equal(P.firstLevelSetupRunning(actor), null);

  // The Feat records level 1.
  ({ cls, actor } = mk());
  DialogV2.wait = async o => answer(o, { kit: "later", feat: o => take(o, [feat.uuid]), skills: "later", finish: o => take(o, []) });
  await P.firstLevelSetup(actor, cls);
  assert.deepEqual(actor.created.map(c => [c.name, c.system.levelTaken]), [["Diehard", 1]]);

  // Skip part way: what was chosen before is added, no Luck, on to starting gold.
  ({ cls, actor } = mk());
  seen = [];
  DialogV2.wait = async o => { seen.push(o.window.title); return answer(o, { kit: o => take(o, [kit.uuid]), feat: "skip" }); };
  assert.equal(await P.firstLevelSetup(actor, cls), "gold");
  assert.deepEqual(seen, ["Tess: Fighter Kit (Step 1 of 4)", "Tess: 1st-level Feat (Step 2 of 4)", "Tess: starting gold"]);
  assert.deepEqual(actor.created.map(c => c.name), ["The Heavy Hand (Fighter)"]);
  assert.equal(actor.system.luck.start, 0);

  // Closed (X) part way: nothing chosen is added, no starting gold; HP is still set.
  ({ cls, actor } = mk());
  seen = [];
  DialogV2.wait = async o => { seen.push(o.window.title); return answer(o, { kit: o => take(o, [kit.uuid]), feat: "later", skills: null }); };
  assert.equal(await P.firstLevelSetup(actor, cls), null);
  assert.equal(seen.length, 3);
  assert.equal(actor.created.length, 0);
  assert.equal(actor.system.attributes.hp.max, 10);
  // Closed on the last step: nothing either.
  ({ cls, actor } = mk());
  DialogV2.wait = async o => answer(o, { kit: o => take(o, [kit.uuid]), feat: "later", skills: "later", finish: null, gold: () => { throw new Error("no gold after X"); } });
  assert.equal(await P.firstLevelSetup(actor, cls), null);
  assert.equal(actor.created.length, 0);

  // No ancestry: it is step 1 (grouped by size), then its subtype from a list with the text, then the class steps.
  ({ cls, actor } = mk(false));
  actor._source.system.abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(k => [k, { value: 12 }]));
  const created = actor.createEmbeddedDocuments.bind(actor);
  actor.createEmbeddedDocuments = async (type, data, opts) => {
    if (data[0]?.type !== "ancestry") return created(type, data, opts);
    const anc = { ...data[0], id: "an9", img: "x.png", flags: {}, getFlag(s, k) { return this.flags[s]?.[k]; },
      async update(d) { for (const [k, v] of Object.entries(d)) foundry.utils.setProperty(this, k, v); } };
    actor.items.push(anc);
    return [anc];
  };
  seen = [];
  DialogV2.wait = async o => {
    seen.push(o);
    const t = o.window.title;
    if (t.startsWith("Tess: ancestry")) return take(o, [elf.uuid]);
    if (t.startsWith("Tess: Elf subtype")) return take(o, ["1"]);
    if (t.startsWith("Tess: Elf (")) return o.buttons[0].callback(null, { form: { elements: { scores: { checked: false } } } });
    return answer(o, { kit: "later", feat: "later", skills: "later", finish: o => o.buttons[0].callback(null, { form: { elements: { luck: { checked: false } } } }) });
  };
  assert.equal(await P.firstLevelSetup(actor, cls), "gold");
  const titles8 = seen.map(o => o.window.title);
  assert.deepEqual(titles8.slice(0, 4), ["Tess: ancestry (Step 1 of 5)", "Tess: Elf subtype (Step 1 of 5)", "Tess: Elf (Step 1 of 5)", "Tess: Fighter Kit (Step 2 of 5)"]);
  assert.ok(seen[0].content.indexOf(">Small<") < seen[0].content.indexOf(">Medium<") && seen[0].content.includes("+2 Dex"), "by size, with the attribute changes");
  assert.ok(seen[1].content.includes("Saevren (Wood Elf)"), "subtypes listed");
  assert.equal(actor.items.find(i => i.id === "an9").name, "Elf (Saevren)", "the subtype taken");
  assert.ok(actor.created.some(c => c.name === "Subtype: Saevren (Wood Elf)"));
  assert.ok(seen[3].content.includes("Max HP is set"), "HP after the ancestry, at the head of the first class step");
  // X on the ancestry: HP set, nothing else asked.
  ({ cls, actor } = mk(false));
  seen = [];
  DialogV2.wait = async o => { seen.push(o.window.title); return null; };
  assert.equal(await P.firstLevelSetup(actor, cls), null);
  assert.deepEqual(seen, ["Tess: ancestry (Step 1 of 5)"]);
  assert.equal(actor.system.attributes.hp.max, 10);
  game.packs = { get: () => null };
  console.log("OK new-character steps (0.10.8)");
}

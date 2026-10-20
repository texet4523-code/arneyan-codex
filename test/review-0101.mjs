// 0.10.1 review fixes: existing worlds get new content, critical range, uses formulas, attribute choices, Verdant
// Power, encounter uses, light timers on big worlds, damage labels and Stun Attack's rounds. Runs on its own or from
// test/run.mjs (it sets up the Foundry stand-ins it needs).
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeItem, makeActor, hbs, sheetContext } from "./harness.mjs";

const root = new URL("../arneyan/", import.meta.url).pathname;
const IM = await import("../arneyan/module/data/item-models.mjs");
const { CharacterData } = await import("../arneyan/module/data/actor-models.mjs");
const packItems = dir => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith("items_"))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const byName = (list, name, cls) => list.find(i => i.name === name && (!cls || i.system.className === cls));

/* ---------------- Foundry stand-ins ---------------- */
const chat = [];
globalThis.ChatMessage = { create: async m => { chat.push(m); return m; }, getSpeaker: () => ({}) };
const warnings = [];
globalThis.ui = { notifications: { warn: m => warnings.push(m), info: () => {}, error: m => warnings.push(m) } };
foundry.applications.handlebars = { renderTemplate: async (p, ctx) => JSON.stringify({ outcome: ctx.outcome, outcomeLabel: ctx.outcomeLabel, targets: ctx.targets, notes: ctx.notes, footer: ctx.footer, modeLabel: ctx.modeLabel, whyLabel: ctx.whyLabel }) };
foundry.utils.isNewerVersion = (a, b) => {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
};
for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
game.settings = { get: (s, k) => settings[k] ?? (k === "migratedTo" ? "" : "publicroll"), set: async (s, k, v) => { settings[k] = v; }, register: () => {} };
const settings = {};

/* ---------------- 4. Critical range: a natural 19 is a critical only if it hits ---------------- */
let nextNatural = 19;
globalThis.Roll = class {
  constructor(f) { this.formula = f; }
  async evaluate() { const bonus = Number(this.formula.match(/\+\s*(\d+)/)?.[1] ?? 0); this.dice = [{ results: [{ result: nextNatural, active: true }] }]; this.total = nextNatural + bonus; return this; }
  static replaceFormulaData(f, d) { return String(f).replace(/@([\w.]+)/g, (_, p) => String(p.split(".").reduce((o, k) => o?.[k], d) ?? 0)); }
};
const R = await import("../arneyan/module/rolls.mjs");
const attack = async (natural, bonus, targets, critAt = 19) => {
  nextNatural = natural;
  const msg = await R.d20Roll({ actor: null, kind: "attack", title: "Sword", parts: [{ label: "Str", value: bonus }], targets, critAt,
    footer: ({ crit }) => (crit ? "CRIT" : "normal") });
  return { flags: msg.flags.arneyan, card: JSON.parse(msg.content) };
};
let r = await attack(19, 2, [{ name: "Knight", ac: 25 }]);
assert.equal(r.flags.natural, 19, "the natural stays as rolled");
assert.equal(r.flags.crit, false, "a 19 that misses is no critical");
assert.equal(r.card.outcome, "failure", "and no automatic hit: 21 against AC 25 misses");
r = await attack(19, 2, [{ name: "Goblin", ac: 15 }]);
assert.equal(r.flags.crit, true, "a 19 that hits is a critical");
assert.equal(r.card.outcome, "crit");
r = await attack(20, 0, [{ name: "Dragon", ac: 40 }]);
assert.ok(r.flags.crit && r.card.outcome === "nat20", "only a real 20 hits whatever the AC");
r = await attack(19, 2, [{ name: "Goblin", ac: 15 }, { name: "Knight", ac: 25 }]);
assert.deepEqual(r.card.targets.map(t => t.outcome), ["crit", "failure"], "per target: a critical on the goblin, a miss on the knight");
assert.equal(r.flags.crit, true);
r = await attack(19, 2, [{ name: "Goblin", ac: 15 }], 20);
assert.equal(r.flags.crit, false, "no expanded range: a 19 is an ordinary hit");
assert.equal(r.card.outcome, "success");
r = await attack(19, 2, []);
assert.equal(r.flags.crit, false, "no target: not a critical yet");
assert.ok(r.card.notes.some(n => n.includes("a critical if it hits")), "but the card says so");
assert.equal(R.outcomeFor(21, 19, 21, "attack", false, 19), "crit");
assert.equal(R.outcomeFor(21, 19, 22, "attack", false, 19), "failure");
assert.equal(R.outcomeFor(21, 19, 21, "save", false, 19), "success", "only attacks crit");
assert.equal(R.isCritical(19, 18, 19, [18]), true);
assert.equal(R.isCritical(19, 18, 19, [19]), false);
assert.equal(R.isCritical(1, 30, 2, [5]), false, "a natural 1 never crits");

/* The real attack roll: Critical Strike's 19 against a high AC, Charge's Advantage on the first melee attack only, and
   Push's attack with no damage buttons. */
{
  const { ArneyanActor } = await import("../arneyan/module/documents.mjs");
  const sword = makeItem(IM.WeaponData, "weapon", "Sword", { damage: "1d8", equipped: true });
  const bow = makeItem(IM.WeaponData, "weapon", "Bow", { damage: "1d8", ranged: true, ability: "dex" });
  const critFeat = makeItem(IM.FeatData, "feat", "Critical Strike", { rules: [{ key: "crit.range", value: "19" }] });
  const charge = makeItem(IM.AbilityData, "ability", "Charge", { kind: "action", toggle: true, active: true, rules: [{ key: "adv.attack.first.melee", value: "1" }] });
  const pc = makeActor(CharacterData, "character", { abilities: { str: { value: 14 } } }, [sword, bow, critFeat, charge]);
  const a = Object.create(ArneyanActor.prototype);
  Object.defineProperty(a, "system", { value: pc.system });
  Object.defineProperty(a, "items", { value: pc.items });
  Object.assign(a, { name: "Hero", type: "character", uuid: "Actor.hero", getActiveTokens: () => [], getFlag: () => null, isOwner: false });
  const foe = ac => [{ name: "Foe", actor: makeActor(CharacterData, "character", { attributes: { ac: { override: ac } } }), token: {} }];
  nextNatural = 19;
  let msg = await a.rollAttack(sword, null, { targets: foe(30) });
  let card = JSON.parse(msg.content);
  assert.equal(msg.flags.arneyan.crit, false, "a 19 that misses AC 30: no critical");
  assert.equal(card.outcome, "failure", "and a miss");
  assert.ok(!card.footer.includes('data-crit="1"><i class="fa-solid fa-star"></i> Critical damage'), "Normal damage leads");
  msg = await a.rollAttack(sword, null, { targets: foe(12) });
  assert.equal(msg.flags.arneyan.crit, true, "a 19 that hits AC 12: critical");
  assert.equal(JSON.parse(msg.content).modeLabel, "Advantage", "Charge: the melee attack has Advantage");
  msg = await a.rollAttack(bow, null, { targets: foe(12) });
  assert.equal(JSON.parse(msg.content).modeLabel, "", "but not a ranged one");
  msg = await a.rollAttack(sword, null, { targets: foe(12), noDamage: "push it 10ft" });
  card = JSON.parse(msg.content);
  assert.ok(!card.footer.includes("arn-damage") && card.footer.includes("push it 10ft"), "Push: no damage buttons");
}

/* ---------------- 9. Damage labels: no zero-dice terms, no dangling "+" ---------------- */
assert.equal(R.resolveFormula("0d6 + 1d8"), "1d8");
assert.equal(R.resolveFormula("1d6 + 0d8"), "1d6");
assert.equal(R.resolveFormula("0d6 + 10d8 + 3"), "10d8 + 3", "10d8 is not a zero-dice term");
assert.equal(R.resolveFormula("0d4"), "0");
const ebDoc = byName(packItems("class-features"), "Eldritch Blast", "Warlock");
assert.deepEqual([1, 5, 9, 13, 17, 24].map(cl => R.resolveFormula(ebDoc.system.damage, { cl }).replace(/\s+/g, "")), ["1d6", "1d8", "2d6", "2d8", "3d6", "3d8"], "Eldritch Blast reads cleanly at every step");

/* ---------------- 5. Uses from a formula, worked out on the character ---------------- */
const E = await import("../arneyan/module/effects.mjs");
assert.equal(E.usesMax("max(1, @dex.mod)", { dex: { mod: 3 } }, 1), 3);
assert.equal(E.usesMax("max(1, @dex.mod)", { dex: { mod: -1 } }, 1), 1, "minimum 1");
assert.equal(E.usesMax("5:1, 9:2, 13:3, 17:4", { cl: 4 }, 1), 0, "Wild Surge before 5th");
assert.equal(E.usesMax("5:1, 9:2, 13:3, 17:4", { cl: 13 }, 1), 3);
assert.equal(E.usesMax("process.exit()", {}, 2), 2, "anything it can't read: the stored maximum");
assert.equal(E.usesMax("3 +", {}, 2), 2, "a syntax error: the stored maximum");
assert.equal(E.usesMax("3 - 10", {}, 2), 0, "never below 0");
const fdoc = byName(packItems("class-features"), "Flèche", "Swashbuckler");
const swash = makeItem(IM.ClassData, "class", "Swashbuckler", { levels: 5 });
const fleche = makeItem(IM.AbilityData, "ability", "Fleche", { ...fdoc.system, uses: { ...fdoc.system.uses, value: 9 } });
const smite = makeItem(IM.AbilityData, "ability", "Smite", { className: "Paladin", uses: { value: 1, max: 1, per: "day", formula: "1:1, 15:2, 20:3" } });
const pal = makeItem(IM.ClassData, "class", "Paladin", { levels: 15 });
const broken = makeItem(IM.FeatData, "feat", "Odd", { uses: { value: 2, max: 2, per: "day", formula: "@dex.mod +* 2" } });
const blood = makeItem(IM.FeatData, "feat", "Blood Magic", { uses: { value: 0, max: 1, per: "day", formula: "max(1, @casting.mod)" } });
const wiz = makeItem(IM.ClassData, "class", "Wizard", { levels: 1, castingAbility: "int" });
const hero = makeActor(CharacterData, "character", { abilities: { dex: { value: 18 }, int: { value: 16 } } }, [swash, pal, wiz, fleche, smite, broken, blood],
  [{ name: "Dexterity Bonus", disabled: false, statuses: [], flags: { arneyan: { rules: [{ key: "ability.dex", value: "1" }] } } }]);
assert.equal(fleche.system.uses.max, 4, "Dex 19 (18 + 1 from a rule): +4 a day");
assert.equal(fleche.system.uses.value, 4, "uses left never above the maximum");
assert.equal(smite.system.uses.max, 2, "Smite Evil: 2 a day from Paladin 15th (its class level, not the character's 21)");
assert.equal(broken.system.uses.max, 2, "a broken formula keeps the stored maximum, and data preparation goes on");
assert.equal(blood.system.uses.max, 2, "Blood Magic: the casting attribute's modifier (Int 16)");
const { formulaUsesFor } = await import("../arneyan/module/data/actor-models.mjs");
assert.equal(formulaUsesFor(hero, fleche), 4, "a feature added now starts full");

/* ---------------- 7. Attribute bonus of the player's choice ---------------- */
const feats = packItems("feats");
assert.deepEqual(byName(feats, "Will of Iron").system.abilityChoice, { options: ["wis", "int", "cha"], value: "" });
assert.deepEqual(byName(feats, "Steady Hand").system.abilityChoice.options, ["str", "dex"]);
assert.deepEqual(byName(packItems("class-features"), "Attribute Bonus", "Fighter").system.abilityChoice.options, ["str", "dex"]);
const woi = makeItem(IM.FeatData, "feat", "Will of Iron", byName(feats, "Will of Iron").system);
const thinker = makeActor(CharacterData, "character", { abilities: { wis: { value: 12 }, int: { value: 12 } } }, [woi]);
assert.equal(thinker.system.abilities.wis.total, 13, "nothing picked: the first option (Wisdom)");
woi.system.abilityChoice.value = "int";
thinker.system.prepareDerivedData();
assert.equal(thinker.system.abilities.int.total, 13, "picked Intelligence");
assert.equal(thinker.system.abilities.wis.total, 12);
assert.equal(thinker.system.saves.will.value, 0 + 1 + 2, "its +2 Will stays (Wis 12: +0, half level 1, +2)");
woi.system.abilityChoice.value = "str";
thinker.system.prepareDerivedData();
assert.equal(thinker.system.abilities.wis.total, 13, "a value not among the options: the first option");
assert.deepEqual(E.chosenRules({ rules: [{ key: "ability.wis", value: "1" }], abilityChoice: { options: ["wis", "cha"], value: "cha" } }), [{ key: "ability.cha", value: "1" }]);
assert.deepEqual(E.chosenRules({ rules: [{ key: "ability.wis", value: "1" }] }), [{ key: "ability.wis", value: "1" }], "no choice: unchanged");
const D = await import("../arneyan/module/documents.mjs");
woi.system.abilityChoice.value = "";
assert.equal(D.needsAbilityChoice(woi), true);
woi.system.abilityChoice.value = "int";
assert.equal(D.needsAbilityChoice(woi), false, "picked already: nothing to ask");
assert.equal(D.needsAbilityChoice({ system: { abilityChoice: { options: ["str"], value: "" } } }), false, "one option: nothing to ask");
// Asked when added: the owner picks, the item stores it.
{
  const upd = [];
  const it = { name: "Will of Iron", isOwner: true, system: { abilityChoice: { options: ["wis", "int", "cha"], value: "" }, rules: [{ key: "ability.wis", value: "1" }] }, update: async d => upd.push(d) };
  foundry.applications.api.DialogV2.wait = async ({ buttons, content }) => { assert.ok(content.includes("Charisma")); return buttons[0].callback(null, { form: { querySelector: () => ({ value: "cha" }) } }); };
  assert.equal(await D.promptAbilityChoice(it), "cha");
  assert.deepEqual(upd, [{ "system.abilityChoice.value": "cha" }]);
  foundry.applications.api.DialogV2.wait = async () => null;
  upd.length = 0;
  assert.equal(await D.promptAbilityChoice(it), "wis", "closed without choosing: the default");
}
// The item sheet: a select for it, the uses formula, and Keep my edits.
{
  const render = hbs(root);
  const { ArneyanItemSheet } = await import("../arneyan/module/sheets.mjs");
  woi._stats = { compendiumSource: "Compendium.arneyan.feats.Item.OJP5xQmv1Y2juxrs" };
  woi.flags = { arneyan: { keepCustom: true } };
  woi._source.system.uses.formula = "max(1, @wis.mod)";
  game.user.isGM = true;
  const ctx = await sheetContext(ArneyanItemSheet, woi, { _activeTab: "details" });
  const html = render("templates/item/item-sheet.hbs", { ...ctx, editable: true });
  assert.ok(html.includes('name="system.abilityChoice.value"') && html.includes('<option value="int" selected>'), "the attribute select");
  assert.ok(html.includes('name="system.uses.formula"') && html.includes("max(1, @wis.mod)"), "the uses formula field");
  assert.ok(html.includes('name="flags.arneyan.keepCustom" checked'), "Keep my edits, ticked");
}

/* ---------------- 8. Verdant Power: one target's bonus, a reminder ---------------- */
const kits = packItems("kits");
const vp = kits.find(k => k.name === "Arcane Grove (Druid)").system.features.find(f => f.name === "Verdant Power");
assert.ok(vp.rules.length && vp.rules.every(r => r.when), "Verdant Power is a reminder, not every spell damage roll");
const druid = makeActor(CharacterData, "character", { abilities: { wis: { value: 16 } } }, [makeItem(IM.AbilityData, "ability", "Verdant Power", { rules: vp.rules })]);
assert.equal(druid.system.mods.damage("spell.damage").length, 0, "no bonus on the roll");
assert.ok(druid.system.mods.notesFor("damage").some(n => n.includes("Verdant Power") && n.includes("one target")), "a note on the damage card");

/* ---------------- 9. Stun Attack: 1 round, 1d4 from 10th ---------------- */
const stun = byName(packItems("class-features"), "Stun Attack", "Monk").system;
assert.equal(stun.applies[0].rounds, "1:1, 10:1d4");
assert.equal(stun.uses.formula, "@cl", "once per Monk level a day");
assert.equal(E.byLevelTable("1:1, 10:1d4", 9), "1");
assert.equal(E.byLevelTable("1:1, 10:1d4", 10), "1d4");
assert.equal(E.byLevelTable(3, 10), 3, "not a table: as it is");
game.combat = null;
nextNatural = 3;
const stunItem = { name: "Stun Attack", img: "x", uuid: "Item.stun", system: { description: "" } };
assert.equal((await E.effectDataFor(stun.applies[0], stunItem, { cl: 5 })).duration.rounds, 1, "5th level: 1 round");
assert.equal((await E.effectDataFor(stun.applies[0], stunItem, { cl: 12 })).duration.rounds, 3, "12th level: 1d4 rounds (rolled 3)");

/* ---------------- 9. Per-encounter uses come back when the fight ends ---------------- */
{
  const C = await import("../arneyan/module/combat.mjs");
  const calls = [];
  const mk = (id, items) => ({ uuid: `Actor.${id}`, name: id, items, updateEmbeddedDocuments: async (t, u) => calls.push([id, u]) });
  const it = (id, per, value, max, type = "ability") => ({ id, type, system: { uses: { per, value, max } } });
  const a = mk("a", [it("x", "encounter", 0, 1), it("y", "day", 0, 1), it("z", "encounter", 2, 2), it("w", "encounter", 0, 3, "feat")]);
  const b = mk("b", [it("q", "week", 0, 1)]);
  const n = await C.resetEncounterUses({ combatants: [{ actor: a }, { actor: a }, { actor: b }, { actor: null }] });
  assert.equal(n, 2);
  assert.deepEqual(calls, [["a", [{ _id: "x", "system.uses.value": 1 }, { _id: "w", "system.uses.value": 3 }]]], "one update for the creature; day, week and full uses untouched");
}

/* ---------------- 9. Light timers: only tokens that may carry a lit light are built ---------------- */
{
  const G = await import("../arneyan/module/gear.mjs");
  const lit = { type: "equipment", system: { light: { lit: true, hours: 1 } } };
  const unlit = { type: "equipment", system: { light: { lit: false, hours: 1 } } };
  const base = (id, items) => ({ id, items: Object.assign(items, { some: Array.prototype.some }) });
  const torchBearer = base("torch", [lit]), goblin = base("gob", [unlit]);
  let built = 0;
  const token = (actorId, delta = null) => ({ actorLink: false, actorId, _source: { delta: { items: delta } }, get actor() { built++; return { id: `${actorId}-token` }; } });
  game.actors = { contents: [torchBearer, goblin] };
  game.scenes = [{ tokens: [token("gob"), token("gob"), token("gob", [lit]), token("torch"), { actorLink: true, actorId: "torch", get actor() { built++; return {}; } }] }];
  const list = G.lightActors();
  assert.equal(built, 2, "only the goblin whose own torch is lit, and the torch-bearer's token, are built");
  assert.equal(list.length, 4, "both world actors and those two tokens");
  game.scenes = []; game.actors = undefined;
}

/* ---------------- 9. Token Action HUD: compendium manoeuvres do what they do ---------------- */
{
  const T = await import("../arneyan/module/tah.mjs");
  const used = [];
  const push = byName(packItems("actions"), "Push");
  const charge = byName(packItems("actions"), "Charge");
  globalThis.fromUuid = async uuid => ({ "Compendium.arneyan.actions.Item.push": push, "Compendium.arneyan.actions.Item.charge": charge }[uuid] ? { ...({ "Compendium.arneyan.actions.Item.push": push, "Compendium.arneyan.actions.Item.charge": charge }[uuid]), toObject() { return JSON.parse(JSON.stringify(this)); } } : null);
  globalThis.CONFIG = { Item: { documentClass: class { constructor(d, { parent }) { Object.assign(this, d); this.actor = parent; } async use() { used.push(["use", this.name]); return "used"; } async toChat() { used.push(["chat", this.name]); return "card"; } } } };
  const mine = { type: "ability", name: "Push", use: async () => { used.push(["own", "Push"]); return "own"; } };
  const actor = { items: Object.assign([], { find: Array.prototype.find, get: () => null }) };
  assert.equal(await T.runHudAction(actor, { actionType: "manoeuvre", actionId: "Compendium.arneyan.actions.Item.push" }, {}), "used", "not on the sheet: its activities run (the Push attack)");
  assert.equal(await T.runHudAction(actor, { actionType: "manoeuvre", actionId: "Compendium.arneyan.actions.Item.charge" }, {}), "card", "a switch (Charge) posts its card");
  actor.items.push(mine);
  assert.equal(await T.runHudAction(actor, { actionType: "manoeuvre", actionId: "Compendium.arneyan.actions.Item.push" }, {}), "own", "on the sheet: the sheet's own item is used");
  assert.deepEqual(used, [["use", "Push"], ["chat", "Charge"], ["own", "Push"]]);
}

/* ---------------- 1. Existing worlds get the new content ---------------- */
const M = await import("../arneyan/module/migrate.mjs");
{
  const cf = packItems("class-features");
  const fSrc = byName(cf, "Flèche", "Swashbuckler");
  const turn = byName(cf, "Turn Undead", "Cleric");
  const woiSrc = byName(feats, "Will of Iron");
  const kitSrc = kits.find(k => k.name === "Arcane Grove (Druid)");
  const spellSrc = packItems("spells").find(s => s.system.save && s.system.damage);
  const docs = Object.fromEntries([fSrc, turn, woiSrc, spellSrc].map(d => [`Compendium.arneyan.${d === woiSrc ? "feats" : d === spellSrc ? "spells" : "class-features"}.Item.${d._id}`, d]));
  docs[`Compendium.arneyan.kits.Item.${kitSrc._id}`] = kitSrc;
  globalThis.fromUuid = async uuid => (docs[uuid] ? { ...docs[uuid], toObject() { return JSON.parse(JSON.stringify(docs[uuid])); } } : null);
  const src = d => Object.keys(docs).find(k => docs[k] === d);
  const old = (Model, type, name, system, extra = {}) => { const i = makeItem(Model, type, name, system); i.id = name.replace(/\W/g, "") || "x"; i.flags = {}; Object.assign(i, extra); return i; };
  // An old Flèche: 1/day, its attack free; a player's own description and name.
  const oldFleche = old(IM.AbilityData, "ability", "Flèche", { className: "Swashbuckler", description: "<p>My notes</p>", uses: { value: 1, max: 1, per: "day" }, activities: [{ ...fSrc.system.activities[0], cost: 0 }] }, { _stats: { compendiumSource: src(fSrc) } });
  // Turn Undead granted by the class (its source in our flag), uses never set.
  const oldTurn = old(IM.AbilityData, "ability", "Turn Undead", { className: "Cleric", uses: { value: 0, max: 0, per: "" }, activities: turn.system.activities.map(a => ({ ...a, cost: 0 })) }, { flags: { arneyan: { source: src(turn) } } });
  // Will of Iron taken before choices existed; another one the player edited and marked to keep.
  const oldWoi = old(IM.FeatData, "feat", "Will of Iron", { rules: [{ key: "ability.wis", value: "1", when: "", label: "" }] }, { _stats: { compendiumSource: src(woiSrc) } });
  const keptWoi = old(IM.FeatData, "feat", "Will of Iron (mine)", { rules: [{ key: "ability.cha", value: "1", when: "", label: "" }] }, { _stats: { compendiumSource: src(woiSrc) }, flags: { arneyan: { keepCustom: true } } });
  // A homebrew feat: no compendium source, never touched.
  const homebrew = old(IM.FeatData, "feat", "Homebrew", { rules: [{ key: "ac", value: "1", when: "", label: "" }] });
  // A kit with stale features, and the feature it granted.
  const oldKit = old(IM.KitData, "kit", "Arcane Grove (Druid)", { className: "Druid", features: kitSrc.system.features.map(f => ({ ...f, rules: [{ key: "spell.damage", value: "+@abilities.wis.mod", when: "", label: "" }] })) }, { _stats: { compendiumSource: src(kitSrc) } });
  const granted = old(IM.AbilityData, "ability", "Verdant Power", { className: "Arcane Grove (Druid)", rules: [{ key: "spell.damage", value: "+@abilities.wis.mod", when: "", label: "" }] }, { flags: { arneyan: { grantedBy: oldKit.id, source: `${oldKit.id}.0` } } });
  // A spell from before the spells audit: no save or damage.
  const oldSpell = old(IM.SpellData, "spell", spellSrc.name, { level: spellSrc.system.level, prepared: true, save: "", damage: "" }, { _stats: { compendiumSource: src(spellSrc) } });
  const cls = [old(IM.ClassData, "class", "Swashbuckler", { levels: 5 }), old(IM.ClassData, "class", "Cleric", { levels: 3 })];
  const items = [...cls, oldFleche, oldTurn, oldWoi, keptWoi, homebrew, oldKit, granted, oldSpell];
  const pc = makeActor(CharacterData, "character", { abilities: { dex: { value: 16 }, wis: { value: 16 } } }, items);
  pc.name = "Old Hero";
  pc.items.contents = items;
  pc.items.has = id => items.some(i => i.id === id);
  const batches = [];
  pc.updateEmbeddedDocuments = async (t, updates) => {
    batches.push(updates);
    for (const u of updates) {
      const i = items.find(x => x.id === u._id);
      for (const [k, v] of Object.entries(u)) if (k !== "_id") { foundry.utils.setProperty(i, k, JSON.parse(JSON.stringify(v))); foundry.utils.setProperty(i._source, k, JSON.parse(JSON.stringify(v))); }
    }
    pc.system.prepareDerivedData();
  };
  game.actors = Object.assign([pc], { contents: [pc] });
  game.items = { contents: [] };
  game.users = Object.assign([{ id: "gm", isGM: true }, { id: "p1", isGM: false }], { activeGM: { isSelf: true } });
  chat.length = 0;
  // 0.10.15: these items predate fingerprints, so the GM is asked once; "Update them" brings them up to date.
  game.system = { version: "0.10.15" };
  const asked = [];
  foundry.applications.api.DialogV2.wait = async o => { asked.push(o.content); return "update"; };
  const res = await M.runMigration();
  assert.equal(asked.length, 1, "asked about the older items once");
  assert.ok(asked[0].includes("before the system kept track of edits"));
  const all = batches.flat();
  const changed = new Set(all.filter(u => Object.keys(u).some(k => k.startsWith("system."))).map(u => u._id));
  batches.length = 0; batches.push([...new Map(all.map(u => [u._id, u])).values()].filter(u => changed.has(u._id)));
  assert.ok(!changed.has(homebrew.id) && !changed.has(keptWoi.id), "homebrew and Keep my edits: untouched");
  assert.ok(!changed.has(cls[0].id), "classes are left alone");
  assert.equal(oldFleche.system.uses.formula, "max(1, @dex.mod)", "Flèche's uses formula");
  assert.equal(oldFleche.system.activities[0].cost, 1, "its attack now spends a use");
  assert.equal(oldFleche.system.uses.value, 1, "uses left kept (1, within the new maximum)");
  assert.equal(oldFleche.system.description, "<p>My notes</p>", "description kept");
  assert.equal(oldFleche.name, "Flèche");
  assert.equal(oldTurn.system.uses.formula, "3 + @wis.mod");
  assert.equal(oldTurn.system.uses.value, 5, "a feature that had no uses starts full (3 + Wis 2)");
  assert.deepEqual(oldWoi.system.abilityChoice.options, ["wis", "int", "cha"], "the feat gets its attribute choice");
  assert.ok(oldKit.system.features[0].rules.every(r => r.when), "the kit's own features list is the current one");
  assert.ok(granted.system.rules.every(r => r.when), "the feature the kit granted follows it");
  assert.equal(oldSpell.system.save, spellSrc.system.save, "the spell gets its save");
  assert.equal(oldSpell.system.damage, spellSrc.system.damage, "and its damage");
  assert.equal(oldSpell.system.prepared, true, "prepared stays");
  assert.deepEqual(res, { items: batches[0].length, actors: 1, world: 0, kept: 0, unstamped: 0 });
  assert.equal(settings.migratedTo, "0.10.15");
  assert.ok([oldFleche, oldTurn, oldWoi, oldKit, granted, oldSpell].every(i => i.flags.arneyan?.synced), "updated items get their fingerprints");
  assert.equal(chat.length, 1);
  assert.deepEqual(chat[0].whisper, ["gm"], "whispered to the GM");
  assert.ok(chat[0].content.includes(`Updated ${batches[0].length} items on 1 actor from the compendiums`), chat[0].content);
  // Once per version; and run again, it finds nothing to change.
  assert.equal(await M.runMigration(), null, "already done");
  batches.length = 0; chat.length = 0;
  const again = await M.runMigration({ force: true });
  assert.equal(batches.length, 0, `idempotent: a second run changes nothing (${JSON.stringify(batches).slice(0, 600)})`);
  assert.deepEqual(again, { items: 0, actors: 0, world: 0, kept: 0, unstamped: 0 });
  assert.equal(chat.length, 0);
  // Only the active GM writes it.
  game.users.activeGM = { isSelf: false };
  assert.equal(await M.runMigration({ force: true }), null);
  game.users.activeGM = { isSelf: true };
}
// The pure helpers.
assert.deepEqual(M.usesFrom({ value: 5, max: 5 }, { max: 3, per: "day", formula: "" }), { max: 3, per: "day", formula: "", value: 3 }, "clamped to the new maximum");
assert.deepEqual(M.usesFrom({ value: 0, max: 0 }, { max: 2, per: "day" }), { max: 2, per: "day", formula: "", value: 2 }, "new uses start full");
assert.equal(M.usesFrom({ value: 4, max: 1 }, { max: 1, formula: "@dex.mod" }, 4).value, 4, "a formula's maximum on the character");
assert.deepEqual(M.refreshFrom({ type: "feat", flags: { arneyan: { keepCustom: true } }, system: { rules: [] } }, { type: "feat", system: { rules: [{ key: "ac" }] } }), {}, "Keep my edits");
assert.deepEqual(M.refreshFrom({ type: "weapon", flags: {}, system: { rules: [] } }, { type: "weapon", system: { rules: [{ key: "ac" }] } }), {}, "gear only gets empty fields filled");
const kf = M.kitFeaturesFrom([{ name: "A", uses: { value: 0, max: 1 } }, { name: "Gone", uses: { value: 1, max: 1 } }], [{ name: "A", uses: { value: 2, max: 2 } }, { name: "B", uses: { value: 1, max: 1 } }]);
assert.deepEqual(kf.map(f => [f.name, f.uses.value]), [["A", 0], ["B", 1]], "uses left kept where the feature is still there");
assert.equal(M.compendiumSourceOf({ _stats: { compendiumSource: "Compendium.arneyan.actions.Item.x" } }), "Compendium.arneyan.actions.Item.x", "actions count");
assert.equal(M.compendiumSourceOf({ _stats: { compendiumSource: "Compendium.world.stuff.Item.x" } }), null, "not a system compendium");

/* README documents the flag and week uses. */
const readme = fs.readFileSync(new URL("../arneyan/README.md", import.meta.url), "utf8");
assert.ok(readme.includes("keepCustom") && readme.includes("What's new in 0.10.1") && /week/i.test(readme));
assert.ok(!readme.includes("—"), "no em dashes in the README");
{
  // The README's version line follows system.json (read, not hard-coded, so a later release doesn't break this test).
  const version = JSON.parse(fs.readFileSync(new URL("../arneyan/system.json", import.meta.url), "utf8")).version;
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.ok(readme.includes(`Version ${version} `), "README names the system.json version");
  assert.ok(!foundry.utils.isNewerVersion("0.10.1", version), "0.10.1 or later");
}

console.log("OK review 0.10.1");

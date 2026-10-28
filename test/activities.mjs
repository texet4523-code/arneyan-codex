// Feature activities: several attacks in one Use (Twin Nock, Combat Dominance, Extra Attack), check bonuses
// (Primeval Instincts), rolls, own save DCs, level tables, and the built data (feats, kit features, actions).
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeItem } from "./harness.mjs";

class FakeRoll {
  constructor(f) { this.formula = f; }
  async evaluate() { this.total = 10; this.dice = [{ results: [{ result: 10, active: true }] }]; return this; }
  async toMessage(data, opts) { posted.push({ roll: this.formula, ...data, rollMode: opts?.rollMode }); return { roll: this.formula }; }
  static replaceFormulaData(f, d) { return String(f).replace(/@([\w.]+)/g, (_, p) => String(p.split(".").reduce((o, k) => o?.[k], d) ?? 0)); }
}
globalThis.Roll = FakeRoll;
const posted = [];
const warnings = [];
globalThis.ui = { notifications: { warn: m => warnings.push(m), error: m => warnings.push(m) } };
globalThis.ChatMessage = { create: async d => { posted.push(d); return d; }, getSpeaker: () => ({}) };
foundry.applications.handlebars = { renderTemplate: async (p, ctx) => JSON.stringify({ title: ctx.title, parts: ctx.parts, whyLabel: ctx.whyLabel }) };
for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
globalThis.game.user.targets = new Set();

const IM = await import("../arneyan/module/data/item-models.mjs");
const D = await import("../arneyan/module/documents.mjs");
const { ArneyanItem, ArneyanActor, byLevel, weaponFits, featureBonusTerms } = D;
const packItems = dir => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith("items_"))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const byName = (list, name, cls) => list.find(i => i.name === name && (!cls || i.system.className === cls));

/* Level tables and formulas. */
assert.equal(byLevel("4:1, 9:2, 13:3, 21:4", 3), 0, "below the first step");
assert.equal(byLevel("4:1, 9:2, 13:3, 21:4", 4), 1);
assert.equal(byLevel("4:1, 9:2, 13:3, 21:4", 12), 2);
assert.equal(byLevel("4:1, 9:2, 13:3, 21:4", 24), 4);
assert.equal(byLevel("4", 1), 4, "a plain number");
assert.equal(byLevel("10 + @half + @cha.mod", 6, { half: 3, cha: { mod: 2 } }), 15, "a formula");
assert.equal(byLevel("2*@cl", 7), 14, "@cl is the level passed");
assert.equal(byLevel("", 7), 0);

/* Which weapons fit. */
const bow = makeItem(IM.WeaponData, "weapon", "Bow, Long", { ranged: true, ammoType: "arrow", damage: "1d8" });
const xbow = makeItem(IM.WeaponData, "weapon", "Crossbow, Light", { ranged: true, ammoType: "bolt", damage: "1d8" });
const sword = makeItem(IM.WeaponData, "weapon", "Sword, Long", { damage: "1d8", equipped: true });
assert.ok(weaponFits(bow, "arrow") && !weaponFits(xbow, "arrow") && !weaponFits(sword, "arrow"), "arrows: bows only");
assert.ok(weaponFits(sword, "melee") && !weaponFits(bow, "melee") && weaponFits(xbow, "ranged") && weaponFits(sword, ""));

/* A per-attack bonus that doesn't stack with another rule: the higher counts. */
let r = featureBonusTerms([{ label: "Bow Mastery", value: "+2" }], [], { value: 1, label: "Twin Nock", noStack: "Bow Mastery" });
assert.deepEqual(r.terms, [{ label: "Bow Mastery", value: "+2" }], "Bow Mastery's +2 beats Twin Nock's +1");
assert.ok(r.notes[0].includes("does not stack"));
r = featureBonusTerms([{ label: "Bow Mastery", value: "+1" }, { label: "Bless", value: "+1d4" }], [], { value: 2, label: "Twin Nock", noStack: "Bow Mastery" });
assert.deepEqual(r.terms, [{ label: "Bless", value: "+1d4" }, { label: "Twin Nock", value: "+2" }], "Twin Nock's +2 replaces Bow Mastery's +1");
r = featureBonusTerms([], [], { value: 3, label: "Twin Nock", noStack: "Bow Mastery" });
assert.deepEqual(r.terms, [{ label: "Twin Nock", value: "+3" }], "a reminder-only Bow Mastery: the bonus is added, with a note");
assert.equal(featureBonusTerms([{ label: "x", value: "+1" }], [], null).terms.length, 1, "no bonus: unchanged");

/* A feature on a mock character. */
function feature(src, { level = 1, cls = "Archer", items = [], type = "ability", Model = IM.AbilityData } = {}) {
  const item = Object.create(ArneyanItem.prototype);
  const system = new Model(src, item);
  const actor = {
    name: "Hero", type: "character", isOwner: true, effects: [], uuid: "Actor.hero",
    system: { level, classDC: 14, abilities: { str: { mod: 3 }, dex: { mod: 2 }, con: { mod: 1 }, cha: { mod: 2 }, wis: { mod: 1 } } },
    getRollData: () => ({ level, half: Math.max(1, Math.floor(level / 2)), cha: { mod: 2 }, wis: { mod: 1 }, str: { mod: 3 } }),
    attacks: [], checks: [],
    async rollAttack(w, ev, opts) { this.attacks.push({ w: w.name, ...opts }); return { ok: true }; },
    rollAbility(k, ev, opts) { this.checks.push({ k, ...opts }); return { k }; }
  };
  const cls_ = { type: "class", name: cls, system: { levels: level } };
  actor.items = [cls_, ...items, item];
  actor.items.get = id => actor.items.find(i => i.id === id);
  Object.defineProperty(item, "actor", { value: actor });
  Object.defineProperty(item, "system", { value: system });
  Object.assign(item, { name: src.name ?? "Feature", type, img: "x.svg", uuid: "Item.f", update: async d => { for (const [k, v] of Object.entries(d)) foundry.utils.setProperty(item, k, v); } });
  return { item, actor };
}
const built = packItems("class-features");
const dataOf = (name, cls) => { const d = byName(built, name, cls); assert.ok(d, `${name} (${cls}) is built`); return d.system; };

/* Twin Nock: two arrows (three from 17th), the second at Disadvantage until 10th, each with Bow Mastery's bonus. */
const twin = dataOf("Twin Nock", "Archer");
assert.equal(twin.activities[0].kind, "attacks");
const fire = async (sys, lvl, opts = {}) => {
  const { item, actor } = feature({ ...sys, name: opts.name ?? "Twin Nock" }, { level: lvl, cls: opts.cls ?? "Archer", items: opts.items ?? [sword, xbow, bow] });
  const acts = item.availableActivities;
  await item._useActivity(acts[0], {});
  return actor.attacks;
};
let shots = await fire(twin, 5);
assert.equal(shots.length, 2, "two arrows at 5th");
assert.ok(shots.every(s => s.w === "Bow, Long"), "only the bow fires arrows (the equipped sword and the crossbow don't)");
assert.equal(shots[0].adv, null, "the first arrow rolls normally");
assert.deepEqual(shots[1].adv.values, [-1], "the second has Disadvantage before 10th");
// Books v0.10.0: each arrow gets Bow Mastery's bonus (+1, +2 at 6th, +3 at 12th, +4 at 18th), never twice.
assert.equal(shots[0].bonus.value, 1, "Bow Mastery's +1 at 5th");
assert.equal(shots[0].bonus.noStack, "Bow Mastery");
assert.ok(shots[1].label.includes("2 of 2"));
shots = await fire(twin, 10);
assert.ok(shots.length === 2 && shots[1].adv === null, "no penalty from 10th");
assert.equal(shots[0].bonus.value, 2, "+2 from 6th");
shots = await fire(twin, 17);
assert.equal(shots.length, 3, "three arrows from 17th");
assert.equal(shots[2].bonus.value, 3, "+3 from 12th");
assert.equal((await fire(twin, 18))[0].bonus.value, 4, "+4 from 18th");
warnings.length = 0;
assert.equal((await fire(twin, 5, { items: [sword] })).length, 0, "no bow: nothing fired");
assert.ok(warnings[0].includes("no weapon that fires arrows"), warnings[0]);

/* Split targets: with two targets, one arrow at each by default. */
const goblin = { name: "Goblin", actor: { system: { level: 1 } } };
const ogre = { name: "Ogre", actor: { system: { level: 7 } } };
game.user.targets = new Set([{ actor: goblin.actor, name: "Goblin" }, { actor: ogre.actor, name: "Ogre" }]);
foundry.applications.api.DialogV2.wait = async ({ buttons }) => buttons[0].callback(null, { form: { querySelector: () => null } });
shots = await fire(twin, 5, { items: [bow] });
assert.deepEqual(shots.map(s => s.targets.map(t => t.name)), [["Goblin"], ["Ogre"]], "one arrow at each target");

/* Combat Dominance: 2/3/4 attacks at 4th/8th/12th, all but the first at Disadvantage, Level up to half yours. */
const dom = dataOf("Combat Dominance", "Fighter");
warnings.length = 0;
shots = await fire(dom, 8, { name: "Combat Dominance", cls: "Fighter", items: [sword] });
assert.equal(shots.length, 3);
assert.ok(shots[0].adv === null && shots[1].adv.values[0] === -1 && shots[2].adv.values[0] === -1, "all but the first at Disadvantage");
assert.ok(warnings.some(w => w.includes("Ogre") && w.includes("Level 4")), "the Level 7 ogre is above half of 8");
assert.ok(!warnings.some(w => w.includes("Goblin")));
assert.equal((await fire(dom, 12, { name: "Combat Dominance", cls: "Fighter", items: [sword] })).length, 4);
assert.equal((await fire(dom, 4, { name: "Combat Dominance", cls: "Fighter", items: [sword] })).length, 2);
game.user.targets = new Set();

/* Extra Attack: two attacks, the second at Disadvantage, every class that has it. */
for (const d of built.filter(i => /^Extra Attack/.test(i.name))) {
  assert.equal(d.system.activities?.[0]?.kind, "attacks", `${d.name} (${d.system.className}) attacks`);
  assert.equal(d.system.activities[0].count, "2");
  assert.equal(d.system.activities[0].disadvantage, "rest");
}

/* Primeval Instincts: books v0.10.26 (K15) give Advantage on physical checks in extreme circumstances, not +4: no
   check buttons, Advantage reminders instead. */
const prim = dataOf("Primeval Instincts", "Barbarian");
assert.equal(prim.save, "", "no stray Fortitude save from 'Advantage on Fortitude saves'");
assert.ok(!(prim.activities ?? []).some(a => a.bonus === "4"), "the +4 check options are gone");
assert.ok(prim.rules.some(r => r.key === "adv.check.str" && Number(r.value) > 0), "Advantage on Strength checks (reminder)");
/* A check option's bonus goes in the roll (rollAbility). */
{
  const a = Object.create(ArneyanActor.prototype);
  Object.defineProperty(a, "system", { value: { abilities: { dex: { mod: 2 } }, mods: null } });
  Object.assign(a, { name: "Barb", type: "character" });
  const msg = await a.rollAbility("dex", null, { bonus: 4, label: "Primeval Instincts" });
  const card = JSON.parse(msg.content);
  assert.deepEqual(card.parts, [{ label: "Dex", value: "+2" }, { label: "Primeval Instincts", value: "+4" }]);
  assert.equal(msg.flags.arneyan.bonus, 6, "+2 Dexterity and +4");
}

/* Holy Campaign: troops rolled by level; Corruption is the GM's secret roll. */
const holy = dataOf("Holy Campaign", "Cleric");
for (const [lvl, f] of [[18, "1d100"], [19, "2d100"], [23, "4d100"]]) {
  const { item } = feature({ ...holy, name: "Holy Campaign" }, { level: lvl, cls: "Cleric" });
  const rolls = item.availableActivities.filter(a => a.kind === "roll");
  assert.deepEqual(rolls.map(a => a.formula), [f, f], `two troop rolls of ${f} at ${lvl}`);
  posted.length = 0;
  await item._useActivity(item.availableActivities.find(a => a.kind === "note"), {});
  assert.ok(posted[0].content.includes(`<strong>${lvl >= 23 ? 3 : lvl >= 19 ? 2 : 1}</strong>`), "the campaign bonus by level");
}
{
  const { item } = feature({ ...dataOf("Corruption", "Sorcerer"), name: "Corruption" }, { level: 5, cls: "Sorcerer" });
  posted.length = 0;
  await item._useActivity(item.availableActivities[0], {});
  assert.equal(posted[0].roll, "1d20");
  assert.equal(posted[0].rollMode, "blindroll", "only the GM sees it");
}

/* Cauldron: the GM's conditions until 23rd, monthly from 24th; the 24th-level item spends nothing. */
const cauldron = dataOf("Cauldron of the Ninth Moon", "Witch");
assert.deepEqual(feature({ ...cauldron }, { level: 20, cls: "Witch" }).item.availableActivities.map(a => a.name), ["Cauldron Ritual"]);
assert.deepEqual(feature({ ...cauldron }, { level: 24, cls: "Witch" }).item.availableActivities.map(a => a.name), ["Cauldron Ritual (monthly)"]);
assert.equal(dataOf("Cauldron of the Ninth Moon improves", "Witch").uses.max, 0);

/* Data slips: Eldritch Blast deals its damage; Embolden calls for no save. */
const eb = dataOf("Eldritch Blast", "Warlock");
assert.equal(eb.save, "ref");
assert.equal(eb.damageType, "force");
const { resolveFormula } = await import("../arneyan/module/rolls.mjs");
const ebAt = cl => resolveFormula(eb.damage, { cl }).replace(/\s+/g, "").replace(/\+?0d\d+/g, "").replace(/^\+/, "");
assert.deepEqual([1, 4, 5, 9, 13, 17, 20, 24].map(ebAt), ["1d6", "1d6", "1d8", "2d6", "2d8", "3d6", "3d6", "3d8"]);
{
  const { item } = feature({ ...eb, name: "Eldritch Blast" }, { level: 9, cls: "Warlock" });
  assert.equal(item.damageRollData().cl, 9, "a feature's damage uses its class level");
}
assert.equal(dataOf("Command: Embolden", "Knight").save, "");
for (const [n, c] of [["Evasion", "Rogue"], ["Battle Space (Master)", "Fighter"], ["Signature Style", "Assassin"]]) assert.equal(dataOf(n, c).save, "", `${n}: no save of its own`);
assert.equal(dataOf("Pinning Shot", "Archer").save, "ref", "a save the feature calls for stays");

/* Feats: uses read from the text (session, encounter), and their activities. */
const feats = packItems("feats");
const feat = n => { const f = byName(feats, n); assert.ok(f, n); return f.system; };
assert.deepEqual(feat("Lucky").uses, { value: 1, max: 1, per: "session" });
assert.deepEqual(feat("Intimidating Presence").uses, { value: 1, max: 1, per: "encounter" });
assert.equal(feat("Battlefield Medic").uses.max, 0, "once per day per target is not a pool");
assert.equal(feat("Ritual Caster").uses.max, 0);
{
  const { item, actor } = feature({ ...feat("Intimidating Presence"), name: "Intimidating Presence" }, { level: 6, type: "feat", Model: IM.FeatData });
  posted.length = 0;
  await item._useAbility({});
  assert.ok(posted[0].content.includes('data-dc="15"'), "its own DC: 10 + half level (3) + Charisma (2)");
  assert.equal(item.system.uses.value, 0, "the encounter's use is spent");
  posted.length = 0;
  await item._useAbility({});
  assert.equal(posted.length, 0, "none left");
  assert.equal(actor.attacks.length, 0);
}
{
  const { item, actor } = feature({ ...feat("Flowing Strikes"), name: "Flowing Strikes" }, { level: 3, type: "feat", Model: IM.FeatData, items: [sword, bow] });
  foundry.applications.api.DialogV2.wait = async () => 1;  // "Against a different creature"
  await item._useAbility({});
  assert.equal(actor.attacks.length, 1);
  assert.equal(actor.attacks[0].w, "Sword, Long", "a melee weapon");
  assert.equal(actor.attacks[0].adv, null, "a normal roll against a different creature");
}

/* Actions: Cleave and the Attack of Opportunity roll an attack; Hide rolls Dexterity. */
const actions = packItems("actions");
assert.equal(byName(actions, "Cleave").system.activities[0].kind, "attacks");
assert.equal(byName(actions, "Attack of Opportunity").system.activities[0].weapons, "melee");
assert.equal(byName(actions, "Hide").system.activities[0].ability, "dex");

/* Kit features: uses from "Once/day", their own damage, and activities; copied on grant. */
const kits = packItems("kits");
const kitFeat = (kit, name) => { const k = kits.find(x => x.name === kit); assert.ok(k, kit); return k.system.features.find(f => f.name === name); };
const ilmater = kitFeat("Deity: Ilmater (The Winter's Solace) (Cleric)", "Granted Power (Ilmater)");
assert.deepEqual(ilmater.uses, { value: 1, max: 1, per: "day" });
assert.equal(ilmater.activities[0].formula, "2d8 + @wis.mod");
const akadi = kitFeat("Deity: Akadi (Cleric)", "Granted Power (Akadi)");
assert.deepEqual([akadi.damage, akadi.damageType, akadi.save, akadi.uses.max], ["3d6", "lightning", "ref", 1]);
// Books v0.10.26 (K15): Drake's Fury is Advantage on physical checks in natural wilderness, not +6 check buttons.
assert.ok(!(kitFeat("Followers of Drake (Barbarian)", "Drake's Fury").activities ?? []).length, "Drake's Fury: no +6 check buttons");
{
  const { syncKitFeatures } = await import("../arneyan/module/progression.mjs");
  const created = [];
  const kit = { id: "kit1", name: "Deity: Akadi (Cleric)", img: "k.svg", system: kits.find(x => x.name === "Deity: Akadi (Cleric)").system };
  const actor = { items: [{ type: "class", name: "Cleric", system: { levels: 3 }, getFlag: () => null }], createEmbeddedDocuments: async (t, list) => created.push(...list), deleteEmbeddedDocuments: async () => {} };
  actor.items.filter = Array.prototype.filter.bind(actor.items);
  await syncKitFeatures(actor, { ...kit, system: { ...kit.system, className: "Cleric" } });
  const got = created.find(c => c.name === "Granted Power (Akadi)");
  assert.ok(got, "granted");
  assert.deepEqual([got.system.damage, got.system.damageType, got.system.save, got.system.uses.max], ["3d6", "lightning", "ref", 1]);
}

/* The sheet shows Use for a feature that only has activities. */
const tpl = fs.readFileSync(new URL("../arneyan/templates/actor/abilities-list.hbs", import.meta.url), "utf8");
assert.ok(tpl.includes("item.system.activities.length"));

/* Every activity is a known kind; attacks have a count. */
const KINDS = new Set(["heal", "temp", "damage", "check", "save", "note", "roll", "attacks"]);
const all = [...built, ...feats, ...actions].flatMap(i => i.system.activities ?? []).concat(kits.flatMap(k => k.system.features.flatMap(f => f.activities ?? [])));
assert.ok(all.length > 250, `${all.length} activities`);
for (const a of all) {
  assert.ok(KINDS.has(a.kind), a.kind);
  if (a.kind === "attacks") assert.ok(a.count, `${a.name} has a count`);
  if (["heal", "temp", "damage", "roll"].includes(a.kind)) assert.ok(a.formula, `${a.name} has a formula`);
  assert.ok(!/[—–]/.test(a.text), `${a.name}: no dashes`);
}

/* ---- 0.10.1 review fixes ---- */

/* Self effects on a feature with activities: applied once per use (Undying Reputation's Advantage), and its temporary
   HP comes from the activity only (the approved effect no longer carries hp.temp, so it isn't doubled). */
const ur = dataOf("Undying Reputation", "Knight");
assert.ok(!ur.applies.some(e => e.rules.some(r => r.key === "hp.temp")), "Undying Reputation: no hp.temp in its effect");
assert.ok(ur.applies.some(e => e.target === "self" && e.rules.some(r => r.key === "adv.attack.first")), "its Advantage stays");
assert.ok(ur.activities.some(a => a.kind === "temp"), "the activity grants the temporary HP");
const pw = dataOf("Primeval Will", "Barbarian");
assert.ok(!(pw.applies ?? []).some(e => e.rules.some(r => r.key === "hp.temp")), "Primeval Will: no hp.temp effect");
assert.ok(pw.activities.some(a => a.kind === "temp"));
for (const d of [...built, ...feats, ...actions]) {
  const s = d.system;
  if ((s.activities ?? []).some(a => a.kind === "temp") && (s.applies ?? []).some(e => e.target === "self" && e.rules.some(r => r.key === "hp.temp"))) assert.fail(`${d.name}: temporary HP twice`);
}
{
  const { item, actor } = feature({ ...ur, name: "Undying Reputation" }, { level: 6, cls: "Knight" });
  const made = [];
  actor.isOwner = true;
  actor.system.mods = { traits: { immune: [] } };
  actor.system.attributes = { hp: { temp: 0 } };
  actor.update = async () => {};
  actor.createEmbeddedDocuments = async (t, list) => { const docs = list.map(d => ({ ...d, origin: d.origin, disabled: false })); made.push(...docs); actor.effects.push(...docs); return docs; };
  posted.length = 0;
  await item._useActivity(item.availableActivities[0], {});
  assert.equal(made.length, 1, "the self effect lands on use");
  assert.equal(made[0].name, "Undying Reputation");
  assert.ok(!made[0].flags.arneyan.rules.some(r => r.key === "hp.temp"));
  await item._useActivity(item.availableActivities[0], {});
  assert.equal(made.length, 1, "used again while it's on: no second copy");
}

/* Uses from a formula: Flèche (Dexterity modifier a day, minimum 1), and its attack spends one. */
const fl = dataOf("Flèche", "Swashbuckler");
assert.equal(fl.uses.formula, "max(1, @dex.mod)");
assert.equal(fl.uses.per, "day");
assert.equal(fl.activities[0].cost, 1, "Flèche's attack spends a use");
const FORMULAS = { "Turn Undead|Cleric": "3 + @wis.mod", "Rage|Barbarian": "max(2, 1 + @con.mod)",
  "Hex (Wisdom)|Witch": "max(1, @wis.mod)", "Wild Surge|Sorcerer": "2:1, 9:2, 13:3, 17:4",
  "Stun Attack|Monk": "@cl", "Ingenuity Points|Artificer": "max(1, @int.mod + @cl)",
  // Books v0.10.25 (R-B7): the pools.
  "Performance (Charisma)|Bard": "max(2, @cl + @cha.mod)", "Lay on Hands|Paladin": "2 * @cl",
  "Command (Charisma)|Knight": "max(2, 1 + @cha.mod) + min(1, floor(@cl / 6)) + min(1, floor(@cl / 12))",
  "Channel Divinity (Charisma)|Paladin": "max(3, @cha.mod + 2) + min(1, floor(@cl / 5)) + min(1, floor(@cl / 15))" };
for (const [k, f] of Object.entries(FORMULAS)) { const [n, c] = k.split("|"); assert.equal(dataOf(n, c).uses.formula, f, k); }
assert.equal(feat("Blood Magic").uses.max, 0, "Blood Magic: the HP cost is the only limit (books v0.10.25)");
for (const k of ["Turn Undead|Cleric", "Wild Surge|Sorcerer"]) { const [n, c] = k.split("|"); assert.ok(dataOf(n, c).activities.every(a => a.cost === 1), `${k}: each use spends one`); }
assert.ok(dataOf("Hex (Wisdom)", "Witch").activities.filter(a => a.kind === "save").every(a => a.cost === 1) && dataOf("Hex (Wisdom)", "Witch").activities.filter(a => a.kind === "damage").every(a => a.cost === 0), "a Hex spends one; its damage each turn doesn't");

/* Several attacks: a blocked target (Full Cover) is skipped and the rest still roll; the use is spent once, after an
   attack rolled; nothing is spent when nothing rolls. */
{
  const { item, actor } = feature({ ...fl, name: "Flèche", uses: { value: 2, max: 2, per: "day", formula: "" }, activities: [{ ...fl.activities[0], count: "3", cost: 1 }] }, { level: 5, cls: "Swashbuckler", items: [sword] });
  let calls = 0;
  actor.rollAttack = async (w, ev, opts) => { calls++; actor.attacks.push(opts); return calls === 1 ? null : { ok: true }; };
  const out = await item._useActivity(item.availableActivities[0], {});
  assert.equal(calls, 3, "the blocked first attack doesn't stop the others");
  assert.equal(out.length, 2);
  assert.equal(item.system.uses.value, 1, "one use spent, once");
  actor.rollAttack = async () => null;
  const none = await item._useActivity(item.availableActivities[0], {});
  assert.equal(none.length, 0);
  assert.equal(item.system.uses.value, 1, "nothing rolled: nothing spent");
  item.system.uses.value = 0;
  warnings.length = 0;
  assert.equal(await item._useActivity(item.availableActivities[0], {}), null);
  assert.ok(warnings[0].includes("no uses left"));
}
/* Reactions aren't tracked (Kieran, 20 Oct 2026): a class feature that is one says so in chat, after the attack and
   not on a cancel; a general manoeuvre (Attack of Opportunity) says nothing, and no combatant is marked. */
{
  const aoo = byName(actions, "Attack of Opportunity").system;
  const notes = () => posted.filter(p => String(p.content ?? "").includes("is used out of turn"));
  for (const [kind, expect] of [["action", 0], ["class", 1]]) {
    const { item, actor } = feature({ ...aoo, kind, name: "Attack of Opportunity" }, { level: 3, items: [sword, makeItem(IM.WeaponData, "weapon", "Axe", { damage: "1d6" })], type: "ability" });
    const flags = [];
    const combatant = { actor, isOwner: true, getFlag: () => false, setFlag: async (s, k, v) => flags.push([k, v]) };
    game.combats = [{ id: "fight", started: true, active: true, scene: { id: "s1" }, combatants: [combatant] }];
    posted.length = 0;
    foundry.applications.api.DialogV2.wait = async () => null; // cancelled
    await item._useActivity(item.availableActivities[0], {});
    assert.equal(notes().length, 0, "cancelled: no note");
    foundry.applications.api.DialogV2.wait = async ({ buttons }) => buttons[0].callback(null, { form: { querySelector: () => null } });
    await item._useActivity(item.availableActivities[0], {});
    assert.equal(notes().length, expect, kind === "class" ? "a class feature notes its reaction" : "a general manoeuvre doesn't");
    assert.equal(flags.length, 0, "nothing tracked on the combatant");
  }
  game.combat = null;
  game.combats = [];
}
/* Push: its attack carries no damage. */
{
  const push = byName(actions, "Push").system;
  const { item, actor } = feature({ ...push, name: "Push" }, { level: 3, items: [sword], type: "ability" });
  await item._useActivity(item.availableActivities[0], {});
  assert.ok(actor.attacks[0].noDamage.startsWith("push a creature"), actor.attacks[0].noDamage);
}

/* Books v0.10.25 to v0.10.27 (R-B7): the pools. Each option offers only its own effect (activity `effect`); a pool
   spends one use per option (two for the big ones); Lay on Hands spends any number of points (`spendAny`). */
{
  const cmd = dataOf("Command (Charisma)", "Knight");
  assert.deepEqual(cmd.activities.map(a => [a.name, a.minLevel, a.cost]), [["Inspire", 0, 1], ["Embolden", 3, 1], ["Demoralise", 5, 1], ["Expert in Arms", 9, 1]]);
  assert.ok(cmd.applies.every(e => e.name === "Expert in Arms" ? e.rounds === "1" : e.rounds === "encounter"), "Commands last the encounter");
  const { item } = feature({ ...cmd, name: "Command (Charisma)", uses: { value: 3, max: 3, per: "day", formula: "" } }, { level: 5, cls: "Knight" });
  assert.deepEqual(item.availableActivities.map(a => a.name), ["Inspire", "Embolden", "Demoralise"], "Expert in Arms from 9th");
  assert.ok(item.availableActivities[0].text.includes("Rallying Cry"), "Rallying Cry rides on every Command from 4th");
  posted.length = 0;
  await item._useActivity(item.availableActivities.find(a => a.name === "Inspire"), {});
  const card = posted.at(-1).content;
  assert.ok(card.includes("Apply Inspired to targets") && !card.includes("Emboldened") && !card.includes("Demoralised"), "Inspire offers only Inspired");
  assert.equal(item.system.uses.value, 2, "one use spent");
  await item._useActivity(item.availableActivities.find(a => a.name === "Demoralise"), {});
  assert.ok(posted.at(-1).content.includes("Apply Demoralised to targets") && posted.at(-1).content.includes("Apply Demoralised (failed save) to targets"));
  const perfItem = feature({ ...dataOf("Performance (Charisma)", "Bard"), name: "Performance (Charisma)", uses: { value: 9, max: 9, per: "day", formula: "" } }, { level: 5, cls: "Bard" }).item;
  await perfItem._useActivity(perfItem.availableActivities.find(a => a.name === "Rally"), {});
  assert.ok(!posted.at(-1).content.includes("Apply "), "an option naming no effect offers none on a pool (Rally)");
  const low = feature({ ...cmd, name: "Command (Charisma)" }, { level: 3, cls: "Knight" }).item;
  assert.ok(!low.availableActivities[0].text.includes("Rallying Cry") && !/ 0\s*$/.test(low.availableActivities[0].text), "before 4th: no Rallying Cry line, and no stray 0");

  const perf = dataOf("Performance (Charisma)", "Bard");
  assert.deepEqual(perf.activities.map(a => [a.name, a.minLevel, a.cost]), [["Exalt", 0, 1], ["Discord", 0, 1], ["Rally", 3, 1], ["Exhort Greatness", 5, 2], ["Words of Power", 10, 2]]);
  const bard = feature({ ...perf, name: "Performance (Charisma)" }, { level: 12, cls: "Bard" }).item;
  assert.ok(bard.availableActivities[0].text.includes("3 allies"), "Exalt reaches 3 allies at 12th");

  const ch = dataOf("Channel Divinity (Charisma)", "Paladin");
  assert.deepEqual(ch.activities.map(a => [a.name.split(":")[0], a.minLevel, a.cost]), [["Smite", 0, 1], ["Turn Undead", 3, 1], ["Divine Intervention", 5, 2], ["Divine Intervention", 5, 2], ["Divine Intervention", 5, 2], ["Divine Intervention", 8, 2]]);

  const loh = dataOf("Lay on Hands", "Paladin");
  const { item: lay } = feature({ ...loh, name: "Lay on Hands", uses: { value: 10, max: 10, per: "day", formula: "" } }, { level: 5, cls: "Paladin" });
  const DialogV2 = foundry.applications.api.DialogV2;
  const was = DialogV2.wait;
  DialogV2.wait = async () => 4;
  const heal = lay.availableActivities.find(a => a.name === "Heal");
  assert.ok(heal.spendAny && heal.formula === "@spent");
  // damageRoll posts a card; here we only check the points spent and the formula's data.
  posted.length = 0;
  await lay._useActivity(heal, {}).catch(() => null);
  assert.equal(lay.system.uses.value, 6, "4 points spent");
  DialogV2.wait = async () => null;
  await lay._useActivity(heal, {});
  assert.equal(lay.system.uses.value, 6, "cancelled: nothing spent");
  DialogV2.wait = was;
  assert.equal(lay.availableActivities.find(a => a.name === "Cure Disease").cost, 5);
}

console.log("OK activities");

// Books v0.10.32 (K28, K29; board B-F19 and R-F9) in the system (0.10.75): the Warlock's Patron Favour pool, the
// save-based Spark Caster, encounter durations, Divine Intervention and Legend of Battle timing, Ambush Predator, the
// four new Fighter kit benefits, pact summons' powers once per encounter and the class rework for the new features.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

const posted = [], warnings = [];
globalThis.ui = { notifications: { warn: m => warnings.push(m), info: () => {}, error: m => warnings.push(m) } };
globalThis.ChatMessage = { create: async d => { posted.push(d); return d; }, getSpeaker: () => ({}) };
for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
globalThis.game.user.targets = new Set();
foundry.applications.handlebars = { renderTemplate: async (p, ctx) => `${ctx.extraHtml ?? ""}` };

const IM = await import("../arneyan/module/data/item-models.mjs");
const { ArneyanItem } = await import("../arneyan/module/documents.mjs");
const M = await import("../arneyan/module/migrate.mjs");
const { pactPowers } = await import("../arneyan/module/summons.mjs");
const packDocs = (dir, prefix = "items_") => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith(prefix))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const features = packDocs("class-features");
const kits = packDocs("kits").filter(k => k.type === "kit");
const feat = (name, cls) => { const f = features.find(i => i.name === name && i.system.className === cls); assert.ok(f, `${name} (${cls}) is built`); return f; };
const kit = name => { const k = kits.find(i => i.name === name); assert.ok(k, `${name} is built`); return k; };
const approved = JSON.parse(fs.readFileSync(new URL("../build/effects/approved.json", import.meta.url), "utf8"));

/* The built data. */
{
  // Spark Caster: a Reflex save against the Class Save DC, Eldritch Blast's dice plus Intelligence, no options to pick.
  const sc = feat("Spark Caster", "Artificer").system;
  assert.equal(sc.save, "ref");
  assert.equal(sc.damageType, "force");
  assert.ok(sc.damage.endsWith("+ @int.mod") && sc.damage.includes("@cl"), sc.damage);
  assert.ok(!(sc.activities ?? []).length, "no attack-roll options left");
  // Patron Favour: 1 a day, 2 from 4th, 3 from 8th.
  const pf = feat("Patron Favour", "Warlock").system;
  assert.deepEqual([pf.uses.per, pf.uses.formula, pf.level], ["day", "1:1, 4:2, 8:3", 1]);
  const warlock = packDocs("classes").find(c => c.name === "Warlock");
  assert.ok(warlock.system.features.some(f => f.name === "Patron Favour" && f.level === 1), "on the Warlock's list at 1st");
  // The 44 patron powers that cost 1 Patron Favour spend the pool; the passive ones have nothing to spend.
  const pooled = kits.flatMap(k => (k.system.features ?? []).filter(f => f.uses?.pool === "Patron Favour").map(f => `${k.name}: ${f.name}`));
  assert.equal(pooled.length, 44, pooled.join("; "));
  assert.ok(pooled.every(n => n.includes("(Warlock)")));
  const zariel = kit("Zariel (Warlock)").system.features;
  assert.equal(zariel.find(f => f.name === "Dark Gift").uses.pool ?? "", "", "Zariel's hellfire is always on");
  const burst = zariel.find(f => f.name === "Patron Feature");
  assert.deepEqual(burst.activities.map(a => a.cost), [1, 0], "a pooled power keeps its cost: one Favour for the burst, both rolls");
  assert.equal(kit("Baphomet (Warlock)").system.features.find(f => f.name === "Patron's Mark").uses.pool ?? "", "", "a passive Mark costs nothing");
  // Sorcerer Metamagic at 1st; the Monk's Iron Mind at 8th (its bonus is Iron Discipline's, so no second effect).
  assert.equal(feat("Metamagic Options", "Sorcerer").system.level, 1);
  assert.equal(feat("Iron Mind", "Monk").system.level, 8);
  assert.ok(!Object.values(approved).some(e => e.name === "Iron Mind"));
  assert.ok(feat("Iron Discipline", "Monk").system.rules.some(r => /Iron Mind/.test(r.when)), "Iron Discipline still carries the Iron Mind bonus");
  // Ambush Predator: Advantage on initiative.
  assert.deepEqual(feat("Ambush Predator", "Assassin").system.rules.map(r => [r.key, String(r.value)]), [["adv.init", "1"]]);
}

/* Durations (m48) and timing (K28). */
{
  const applies = (name, cls) => feat(name, cls).system.applies;
  assert.ok(applies("Challenge", "Knight").every(a => a.rounds === "encounter"), "Challenge lasts the encounter");
  assert.ok(applies("Hex (Wisdom)", "Witch").every(a => a.rounds === "encounter"), "Hex lasts the encounter");
  assert.equal(String(applies("Intimidate (Strength)", "Barbarian")[0].rounds), "1", "Intimidate: until the end of its next turn");
  const di = feat("Channel Divinity (Charisma)", "Paladin").system.activities.filter(a => a.name.startsWith("Divine Intervention"));
  assert.ok(di.find(a => a.name.endsWith("reroll")).text.includes("Right after the roll") && di.find(a => a.name.endsWith("reroll")).reaction);
  assert.ok(di.find(a => a.name.endsWith("divine might")).text.includes("until the end of your turn"));
  assert.ok(di.find(a => a.name.endsWith("halve damage")).text.includes("until the start of your next turn") && di.find(a => a.name.endsWith("halve damage")).reaction);
  assert.ok(!di.some(a => /for 1 round|this round/.test(a.text)));
  assert.ok(feat("Sorcerer's Spark", "Sorcerer").system.activities[0].text.startsWith("For the encounter"));
  assert.ok(feat("Marked Prey", "Ranger").system.activities[0].text.includes("for the encounter"));
  for (const k of ["Deity: Helm (The Vigilant End) (Cleric)", "Deity: Helm (The Vigilant End) (Paladin)"]) assert.equal(kit(k).system.features[0].applies[0].rounds, "encounter");
}

/* The four Fighter kit benefits (K28). */
{
  const f = (k, i = 0) => kit(k).system.features[i];
  const crowd = f("Gladiator, The Pit-Forged (Fighter)");
  assert.deepEqual(crowd.applies.map(a => [a.target, String(a.rounds), a.statuses.join()]), [["target", "1", "shaken"]], "Crowd's Favourite: Disadvantage on its next attack");
  const wall = f("Boldock Wall Guard (Fighter)");
  assert.deepEqual(wall.rules.map(r => [r.key, String(r.value)]), [["adv.against.first", "-1"]]);
  assert.ok(/Orc/.test(wall.rules[0].when));
  const cav = f("Mercenary, Blade for Hire (Fighter)");
  assert.ok(cav.rules.length === 1 && cav.rules[0].key === "note.attack" && /Attack of Opportunity/.test(cav.rules[0].value));
  const guard = f("Mournas Liberator (Fighter)");
  assert.deepEqual(guard.applies.map(a => [a.target, String(a.rounds), a.rules.map(r => `${r.key} ${r.value}`).join()]), [["target", "1", "adv.against -1"]]);
  const tenor = f("Tenor Hold Mechanist (Gunslinger)");
  assert.ok(/Extra Attack/.test(tenor.rules[0].value) && !/\+1 damage/.test(tenor.rules[0].value));
}

/* Spending a pool: a patron power takes its Favour from the Warlock's Patron Favour feature. */
function warlockWith(favourLeft, powers) {
  const actor = { name: "Vex", type: "character", isOwner: true, effects: [], uuid: "Actor.vex",
    system: { level: 8, classDC: 15, abilities: { cha: { mod: 3 } } }, getRollData: () => ({ level: 8, cha: { mod: 3 } }) };
  const mk = (src, Model = IM.AbilityData) => {
    const item = Object.create(ArneyanItem.prototype);
    const system = new Model(src, item);
    Object.defineProperty(item, "actor", { value: actor });
    Object.defineProperty(item, "system", { value: system });
    Object.assign(item, { name: src.name, type: "ability", img: "x.svg", uuid: `Item.${src.name}`, update: async d => { for (const [k, v] of Object.entries(d)) foundry.utils.setProperty(item, k, v); } });
    return item;
  };
  const cls = { type: "class", name: "Warlock", system: { levels: 8 } };
  const favour = favourLeft === null ? null : mk({ name: "Patron Favour", className: "Warlock", level: 1, uses: { value: favourLeft, max: 3, per: "day", formula: "1:1, 4:2, 8:3" } });
  const items = powers.map(p => mk({ className: "Asmodeus (Warlock)", level: 1, ...p }));
  actor.items = [cls, ...(favour ? [favour] : []), ...items];
  actor.items.get = id => actor.items.find(i => i.id === id);
  return { actor, favour, items };
}
{
  const pool = { value: 0, max: 0, per: "", formula: "", pool: "Patron Favour" };
  const { favour, items: [gift, fury] } = warlockWith(2, [
    { name: "Dark Gift", uses: pool, save: "will" },
    { name: "Patron Feature", uses: pool, toggle: true }
  ]);
  assert.equal(gift.usesStore, favour);
  assert.deepEqual([gift.usesCount.value, gift.usesCount.max, gift.usesCount.label], [2, 3, "Patron Favour"]);
  posted.length = 0;
  await gift._useAbility({});
  assert.equal(favour.system.uses.value, 1, "the Dark Gift took 1 Patron Favour");
  assert.ok(posted.at(-1).content.includes("1 of 3 Patron Favour left"), posted.at(-1).content);
  await fury._useAbility({});
  assert.equal(favour.system.uses.value, 0, "switching the Patron Feature on took the last one");
  assert.equal(fury.system.active, true);
  await fury._useAbility({});
  assert.equal(fury.system.active, false, "switching off costs nothing");
  warnings.length = 0; posted.length = 0;
  await gift._useAbility({});
  assert.equal(posted.length, 0, "no Favour left: nothing used");
  assert.ok(warnings[0].includes("No Patron Favour left for Dark Gift"), warnings[0]);
  // Activities spend from the pool too (Zariel's burst: one Favour for both rolls).
  const { favour: f2, items: [burst] } = warlockWith(1, [{ name: "Patron Feature", uses: pool, activities: [{ name: "Burst", kind: "note", cost: 1 }, { name: "Echo", kind: "note", cost: 0 }] }]);
  assert.ok(await burst._spendFor({ cost: 1 }));
  assert.equal(f2.system.uses.value, 0);
  assert.ok(await burst._spendFor({ cost: 0 }), "a free option needs no Favour");
  assert.equal(await burst._spendFor({ cost: 1 }), false);
  // No Patron Favour on the sheet (a class the GM keeps as edited, so the update didn't add it): the power still
  // works, uncounted, with a warning.
  const { items: [lost] } = warlockWith(null, [{ name: "Dark Gift", uses: pool }]);
  warnings.length = 0;
  assert.equal(lost.usesStore, null);
  assert.equal(await lost._spendUses(1), true);
  assert.ok(warnings[0].includes("spends Patron Favour") && warnings[0].includes("not counted"), warnings[0]);
  // A feature with its own uses is unchanged.
  const { items: [own] } = warlockWith(3, [{ name: "Eldritch Master", uses: { value: 1, max: 1, per: "day" } }]);
  assert.equal(own.usesStore, own);
  assert.ok(await own._spendUses(1));
  assert.equal(own.system.uses.value, 0);
}

/* Updating a world: the pool arrives on a granted patron power; a feature without one is untouched. */
{
  assert.deepEqual(M.usesFrom({ value: 1, max: 1, per: "day" }, { max: 0, per: "", formula: "", pool: "Patron Favour" }),
    { max: 0, per: "", formula: "", pool: "Patron Favour", value: 0 });
  assert.ok(!("pool" in M.usesFrom({ value: 1, max: 1, per: "day" }, { max: 1, per: "day", formula: "" })), "no pool on either side: no field");
  assert.equal(M.usesFrom({ value: 0, max: 0, pool: "Patron Favour" }, { max: 0, per: "" }).pool, "", "a pool the books dropped goes");
  assert.equal(M.CLASS_REWORK, "0.10.75", "the class rework runs again: Patron Favour, Iron Mind, Metamagic at 1st");
  // The schema fills a blank pool into every stored item and kit feature: that is no edit and no change (review
  // 0.10.75: unedited kits read as edited, and every item with uses was rewritten).
  const SRC = "Compendium.arneyan.class-features.Item.x";
  const oldUses = { value: 1, max: 1, per: "day", formula: "" };
  const stored = (system, synced) => ({ id: "i1", type: system.features ? "kit" : "ability", name: "T", system, flags: { arneyan: { synced } }, _stats: { compendiumSource: SRC }, _source: { system, flags: { arneyan: { synced } } } });
  const ability = { uses: oldUses, rules: [] };
  const stamp = M.stampOf("ability", ability);
  const loaded = { uses: { ...oldUses, pool: "" }, rules: [] };
  const same = M.refreshFrom(stored(loaded, stamp), { type: "ability", system: ability });
  assert.ok(!Object.keys(same).some(k => k.startsWith("system.")), `an unchanged item stays unchanged: ${JSON.stringify(same)}`);
  const feature = (uses, extra = {}) => ({ name: "Dark Gift", level: 1, description: "<p>x</p>", uses, save: "", damage: "", activities: [], replaces: "", rules: [], ...extra });
  const kitOld = { features: [feature(oldUses)] };
  const kitStamp = M.stampOf("kit", kitOld);
  const kitLoaded = { features: [feature({ ...oldUses, pool: "" })] };
  const kitNew = { features: [feature({ value: 0, max: 0, per: "", formula: "", pool: "Patron Favour" })] };
  const r = {};
  const upd = M.refreshFrom(stored(kitLoaded, kitStamp), { type: "kit", system: kitNew }, { report: r });
  assert.ok(!r.kept, "an unedited kit isn't taken for the GM's edit");
  assert.equal(upd["system.features"]?.[0]?.uses?.pool, "Patron Favour", "the pool reaches the kit");
}

/* Pact summons: a power the Bestiary gives once per 3 rounds is once per encounter on a Warlock's servant. */
{
  const hound = { items: [
    { type: "ability", name: "Breathe Fire", system: { description: "<p>Once per <strong>3 rounds</strong>, as an action, a cone.</p>", uses: { value: 0, max: 0, per: "" } } },
    { type: "ability", name: "Spores", system: { description: "<p>As an action, once per 3 rounds: spores.</p>", uses: { value: 0, max: 0, per: "" } } },
    { type: "ability", name: "Keen Smell", system: { description: "<p>Advantage on Perception.</p>", uses: { value: 0, max: 0, per: "" } } },
    { type: "weapon", name: "Bite", system: { description: "once per 3 rounds" } }
  ] };
  pactPowers(hound);
  assert.equal(hound.items[0].system.description, "<p>Once per encounter, as an action, a cone.</p>");
  assert.deepEqual(hound.items[0].system.uses, { value: 1, max: 1, per: "encounter" });
  assert.ok(hound.items[1].system.description.includes("once per encounter: spores"));
  assert.equal(hound.items[2].system.uses.max, 0, "other abilities untouched");
  assert.equal(hound.items[3].system.description, "once per 3 rounds", "only abilities");
  // The Bestiary entries this covers.
  const monsters = packDocs("monsters", "actors_");
  for (const n of ["Hell Hound", "Pixie", "Redcap", "Vrock", "Star Spawn Hulk"]) {
    const m = structuredClone(monsters.find(x => x.name === n));
    assert.ok(m, n);
    pactPowers(m);
    assert.ok(m.items.some(i => i.system?.uses?.per === "encounter"), `${n} gets a once-per-encounter power`);
  }
}

console.log("OK 0.10.75 books v0.10.32 (K28, K29)");

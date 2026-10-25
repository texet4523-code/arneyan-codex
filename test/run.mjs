import assert from "node:assert/strict";
import { makeItem, makeActor, hbs } from "./harness.mjs";
const root = new URL("../arneyan/", import.meta.url).pathname;
const { ARNEYAN } = await import("../arneyan/module/config.mjs");
const { CharacterData, NpcData } = await import("../arneyan/module/data/actor-models.mjs");
const IM = await import("../arneyan/module/data/item-models.mjs");

// Modifier table spot checks.
const table = { 0: -5, 1: -4, 2: -4, 3: -3, 4: -2, 5: -2, 6: -1, 8: -1, 9: 0, 12: 0, 13: 1, 15: 1, 16: 2, 17: 2, 18: 3, 19: 4, 20: 4, 21: 5, 22: 5, 23: 6, 25: 6, 26: 7, 28: 8, 30: 9 };
for (const [s, m] of Object.entries(table)) assert.equal(ARNEYAN.abilityMod(Number(s)), m, `mod ${s}`);

// BtH table spot checks against the handbook's 12th and 24th values.
const bth12 = { martial: 8, knight: 7, divine: 4, rogue: 2, arcane: 2 };
const bth24 = { martial: 16, knight: 15, divine: 8, rogue: 5, arcane: 4 };
for (const k of Object.keys(bth12)) { assert.equal(ARNEYAN.bth(k, 12), bth12[k]); assert.equal(ARNEYAN.bth(k, 24), bth24[k]); assert.equal(ARNEYAN.bth(k, 1), 0); }

// A 5th-level Fighter with Dex 14, Con 16, chain mail and a shield.
const fighter = makeItem(IM.ClassData, "class", "Fighter", { levels: 5, hitDie: "d10", bthProgression: "martial", keyAbility: "str", xpRate: 10 });
const chain = makeItem(IM.ArmourData, "armour", "Chain Mail Hauberk", { category: "heavy", ac: 5, equipped: true, slots: 3 });
const shield = makeItem(IM.ArmourData, "armour", "Medium Shield", { category: "shield", ac: 1, equipped: true, slots: 1 });
const sword = makeItem(IM.WeaponData, "weapon", "Longsword", { damage: "1d8", slots: 1, quantity: 1 });
const arrows = makeItem(IM.EquipmentData, "equipment", "Arrows", { slots: 1 / 30, quantity: 30 });
const skill = makeItem(IM.SkillData, "skill", "Blacksmithing", { ability: "str", tier: "master" });
const pc = makeActor(CharacterData, "character", {
  abilities: { str: { value: 17 }, dex: { value: 14 }, con: { value: 16 }, int: { value: 10 }, wis: { value: 9 }, cha: { value: 8 } },
  currency: { gp: 150 }
}, [fighter, chain, shield, sword, arrows, skill]);
const s = pc.system;
assert.equal(s.level, 5);
assert.equal(s.bth, 3);                    // Martial 5th = +3
assert.equal(s.attributes.ac.value, 16);   // 10 + 5 heavy (no Dex) + 1 shield: the handbook's own example
assert.equal(s.saves.fort.value, 2 + 2);   // Con +2, half of 5 = 2
assert.equal(s.saves.ref.value, 1 + 2);
assert.equal(s.saves.will.value, 0 + 2);
assert.equal(s.attributes.deathAt, -12);   // -10 minus Con +2
assert.equal(s.nwp.max, 4); assert.equal(s.nwp.used, 2);
assert.equal(s.inventory.max, 20);         // Str 16+
assert.equal(s.inventory.used, 3 + 1 + 1 + 1 + 2); // armour, shield, sword, arrows, 150 coins
assert.equal(s.xpRate, 10);
assert.equal(s.classDC, 10 + 2 + 2);

// Level 1 wizard multiclass: XP rate is the highest plus 2, saves use half level minimum 1.
const wiz = makeItem(IM.ClassData, "class", "Wizard", { levels: 1, bthProgression: "arcane", keyAbility: "int", castingAbility: "int", xpRate: 12 });
const rogue = makeItem(IM.ClassData, "class", "Rogue", { levels: 1, bthProgression: "rogue", xpRate: 8 });
const mc = makeActor(CharacterData, "character", { abilities: { int: { value: 18 } } }, [rogue, wiz]);
assert.equal(mc.system.level, 2);
assert.equal(mc.system.xpRate, 14);        // the handbook's Rogue/Wizard example
assert.equal(mc.system.saves.will.value, 1);
assert.equal(mc.system.spellDC, 10 + 1 + 3);

// Medium armour caps Dex at +2.
const scale = makeItem(IM.ArmourData, "armour", "Scale", { category: "medium", ac: 4, equipped: true });
const nimble = makeActor(CharacterData, "character", { abilities: { dex: { value: 19 } } }, [scale]);
assert.equal(nimble.system.attributes.ac.value, 16);
// 11th level: dies at -20 minus Con.
const vet = makeActor(CharacterData, "character", { abilities: { con: { value: 13 } }, attributes: { hp: { value: -21 } } }, [makeItem(IM.ClassData, "class", "Fighter", { levels: 11 })]);
assert.equal(vet.system.attributes.deathAt, -21); assert.equal(vet.system.attributes.state, "dead");

// Spell slots from the class table plus casting-stat bonus slots.
import fs from "node:fs";
const wizSrc = JSON.parse(fs.readFileSync(fs.readdirSync(new URL("../packs-src/classes/", import.meta.url).pathname).filter(f => f.startsWith("items_Wizard_")).map(f => new URL("../packs-src/classes/" + f, import.meta.url).pathname)[0], "utf8"));
const wiz5 = makeItem(IM.ClassData, "class", "Wizard", { ...wizSrc.system, levels: 5 });
const fireball = makeItem(IM.SpellData, "spell", "Fireball", { level: 3, className: "Wizard", damage: "min(@cl, 10)d6", damageType: "fire", save: "ref" });
const light = makeItem(IM.SpellData, "spell", "Light", { level: 0, className: "Wizard" });
wiz5.system.extraSlots = [0, 1]; wiz5.system.slotsUsed = [0, 2];
const mage = makeActor(CharacterData, "character", { abilities: { int: { value: 16 } } }, [wiz5, fireball, light]);
const cst = mage.system.casters[0];
assert.equal(cst.slots[1].total, 4 + 1 + 1); // table 4, Int 13+ bonus, 1 extra by hand
assert.equal(cst.slots[1].left, 4);          // 2 spent
assert.equal(cst.slots[2].total, 2 + 1);     // Int 16+ bonus
assert.equal(cst.slots[3].total, 1);         // needs Int 18 for the bonus
assert.equal(cst.slots[4].total, 0);
assert.equal(cst.dc, 10 + 2 + 2);

// Effects layer: rules from feats, toggles, conditions and Exhaustion.
const { ModSet, evalNumber, collectRules } = await import("../arneyan/module/effects.mjs");
assert.equal(evalNumber("floor(@level/4)", { level: 9 }), 2);
assert.equal(evalNumber("@cl", { cl: 7 }), 7);
assert.equal(evalNumber("process.exit()", {}), 0, "only whitelisted functions run");
const tough = makeItem(IM.FeatData, "feat", "Toughness", { rules: [{ key: "hp.level", value: "1" }, { key: "save.fort", value: "1" }, { key: "adv.save.ref", value: "1", when: "vs traps" }] });
const rage = makeItem(IM.AbilityData, "ability", "Rage", { toggle: true, active: false, rules: [{ key: "damage.melee", value: "+2" }, { key: "adv.check.str", value: "1" }] });
const ring = makeItem(IM.EquipmentData, "equipment", "Ring of Protection", { equipped: true, slots: 0, rules: [{ key: "ac", value: "1" }, { key: "save", value: "1" }] });
const bless = { name: "Bless", disabled: false, statuses: [], flags: { arneyan: { rules: [{ key: "adv.attack.first", value: "1" }, { key: "save", value: "1" }], cl: 3 } } };
const proneEff = { name: "Prone", disabled: false, statuses: new Set(["prone"]), flags: {} };
const hero = makeActor(CharacterData, "character", { abilities: { con: { value: 16 }, dex: { value: 13 } }, attributes: { exhaustion: 2, speed: 30 } },
  [makeItem(IM.ClassData, "class", "Fighter", { levels: 4, bthProgression: "martial" }), tough, rage, ring], [bless, proneEff]);
const hs = hero.system;
assert.equal(hs.saves.fort.value, 2 + 2 + 1 + 1 + 1, "Con +2, half level 2, Toughness, ring, Bless");
assert.equal(hs.attributes.ac.value, 10 + 1 + 1, "Dex +1 and the ring");
assert.equal(hs.attributes.hp.max, 1 + 4, "Toughness adds 1 per level to the derived max");
assert.equal(hs.attributes.speedNow, 15, "Exhaustion 2 halves speed");
assert.ok(hs.mods.adv("adv.init").values.includes(-1), "Exhaustion 1: Disadvantage on Initiative");
assert.ok(hs.mods.adv("adv.against.melee").values.includes(1), "Prone: melee attacks against it have Advantage");
assert.equal(hs.mods.damage("damage.melee").length, 0, "Rage is off");
assert.ok(hs.mods.notesFor("save").some(n => n.includes("vs traps")), "situational rule becomes a reminder");
{
  // 0.10.14: a resistance only some of the time names its type (Shifter's Beasthide), not "+0 (resist)".
  const ms = new ModSet([{ key: "resist", value: "slashing 3", when: "Beasthide only, nonmagical", label: "Shifter" }, { key: "speed", value: "15", when: "Swiftstride only", label: "Shifter" }]);
  assert.deepEqual(ms.situational.map(x => x.text), ["Shifter: Resistance slashing 3 Beasthide only, nonmagical", "Shifter: +15 (speed) Swiftstride only"]);
  assert.equal(ms.traits.resist.length, 0, "and it isn't a standing resistance");
}
rage.system.active = true;
hero.system.prepareDerivedData();
assert.equal(hero.system.mods.damage("damage.melee")[0].value, "+2", "Rage switched on");
ring.system.equipped = false;
hero.system.prepareDerivedData();
assert.equal(hero.system.attributes.ac.value, 11, "unequipped ring no longer counts");
// Mage Armour style base AC, resist amounts, crit range, multipliers multiply.
const mageArmour = { name: "Mage Armour", disabled: false, statuses: [], flags: { arneyan: { rules: [{ key: "ac.base", value: "13" }, { key: "resist", value: "fire 5" }, { key: "crit.range", value: "19" }, { key: "speed.mult", value: "2" }] } } };
const caster = makeActor(CharacterData, "character", { abilities: { dex: { value: 14 } }, attributes: { exhaustion: 2, speed: 30 } }, [], [mageArmour]);
assert.equal(caster.system.attributes.ac.value, 13 + 1);
assert.deepEqual(caster.system.traits.resist, ["fire 5"]);
assert.equal(caster.system.critRange, 19);
assert.equal(caster.system.attributes.speedNow, 30, "x2 and x0.5 cancel out");

// NPC.
const ogre = makeActor(NpcData, "npc", { level: 4, attributes: { ac: 15, attack: 5 }, saves: { fort: 6, ref: 1, will: 2 } });
assert.equal(ogre.system.saveList[0].value, 6);

// Render templates with the sheets' real context code.
const render = hbs(root);
const { ArneyanActorSheet, ArneyanItemSheet } = await import("../arneyan/module/sheets.mjs");
const { sheetContext } = await import("./harness.mjs");
for (const t of ["main", "combat", "spells", "skills", "gear", "bio"]) {
  const ctx = await sheetContext(ArneyanActorSheet, pc, { _activeTab: t, _expanded: new Set([sword.id]) });
  const html = render("templates/actor/actor-sheet.hbs", ctx);
  assert.ok(html.includes("Chain Mail Hauberk") && html.includes("Blacksmithing") && html.includes("Master"));
  assert.ok(html.includes('class="arn-class-level"') && html.includes('data-action="rest"'));
  assert.ok(html.includes(">+3</button>") && html.includes("1d8+2"), "weapon to hit and damage on the Combat tab");
}
const mctx = await sheetContext(ArneyanActorSheet, mage);
const mhtml = render("templates/actor/actor-sheet.hbs", mctx);
assert.equal(mctx.spellSections.length, 1);
assert.equal((mhtml.match(/class="arn-pip /g) || []).length, 6 + 3 + 1, "one pip per slot");
assert.equal((mhtml.match(/class="arn-pip used"/g) || []).length, 2);
assert.ok(mhtml.includes(`data-class-id="${wiz5.id}"`) && mhtml.includes("Fireball") && mhtml.includes("Cantrips"));
for (const t of ["actions", "spells", "features", "skills", "gear", "effects", "bio"]) {
  for (const edit of [true, false]) {
    const ctx = await sheetContext(ArneyanActorSheet, hero, { _activeTab: t, _editMode: edit });
    const html = render("templates/actor/actor-sheet.hbs", ctx);
    assert.ok(html.includes('data-action="toggleCondition"') && html.includes("Luck"), t);
    assert.equal(html.includes('name="system.abilities.str.value"'), edit, "scores are only inputs in edit mode");
  }
}
const ectx = await sheetContext(ArneyanActorSheet, hero, { _activeTab: "effects" });
const ehtml = render("templates/actor/actor-sheet.hbs", ectx);
assert.ok(ehtml.includes("Bless") && ehtml.includes("Toughness") && ehtml.includes("arn-cond-chip on"), "effects tab lists sources and active conditions");
const octx = await sheetContext(ArneyanActorSheet, ogre, { _editMode: true });
const html2 = render("templates/actor/actor-sheet.hbs", octx);
assert.ok(html2.includes('name="system.saves.fort" value="6"'));

const kitSrc = { className: "Fighter", features: [{ name: "Shield Wall", level: 1, description: "<p>Allies gain +1 AC.</p>" }, { name: "Rally", level: 6, description: "<p>Rally!</p>" }] };
const extras = { class: { ...wizSrc.system, levels: 5 }, kit: kitSrc, feat: { rules: [{ key: "ac", value: "1", when: "", label: "" }] }, spell: { applies: [{ name: "Bless", target: "target", rounds: "10", statuses: ["prone"], rules: [{ key: "save", value: "1", when: "", label: "" }] }] } };
for (const [Model, type] of [[IM.ClassData, "class"], [IM.AncestryData, "ancestry"], [IM.KitData, "kit"], [IM.FeatData, "feat"], [IM.SkillData, "skill"], [IM.AbilityData, "ability"], [IM.WeaponData, "weapon"], [IM.ArmourData, "armour"], [IM.EquipmentData, "equipment"], [IM.SpellData, "spell"]]) {
  const it = makeItem(Model, type, `A ${type}`, extras[type] ?? {});
  const out = render("templates/item/item-sheet.hbs", await sheetContext(ArneyanItemSheet, it));
  assert.ok(out.includes('name="name"'), type);
  if (type === "kit") assert.ok(out.includes("Shield Wall") && out.includes("Rally!"));
  if (type === "class") { assert.ok(out.includes('class="arn-extra-slot"') && out.includes("Class Abilities")); }
  if (["feat", "ability", "spell", "weapon"].includes(type)) assert.ok(out.includes("arn-rules-editor"), `${type} has the effects editor`);
}
render("templates/chat/roll-card.hbs", { title: "x", parts: [{ label: "Str", value: "+3" }], dice: [{ result: 12 }], total: 15, canBurn: true, luckBurned: 0, outcome: "success", outcomeLabel: "Success", notes: ["a"], targets: [{ name: "Orc", ac: 13, outcome: "success", label: "Hit" }] });
render("templates/chat/damage-card.hbs", { title: "Burning Hands", type: "Fire", damageType: "fire", formula: "1d3 + 1", total: 3, dice: [{ result: 2, faces: 3 }], parts: [], notes: [] });
render("templates/apps/text-editor.hbs", { field: "system.details.biography", value: "<p>Hi</p>" });
render("templates/chat/item-card.hbs", { item: { img: "", name: "Fireball", type: "spell", system: { level: 3 } }, config: ARNEYAN, description: "", page: 140, book: "phb" });
render("templates/actor/actor-sheet.hbs", await sheetContext(ArneyanActorSheet, ogre, { _editMode: false, _activeTab: "bio" }));
globalThis.Roll = { replaceFormulaData: (f, d) => f.replace(/@([\w.]+)/g, (_, p) => String(p.split(".").reduce((o, k) => o?.[k], d) ?? 0)) };
const { resolveFormula } = await import("../arneyan/module/rolls.mjs");
assert.equal(resolveFormula("1d3 + min(@cl, 10)", { cl: 1 }), "1d3 + 1");
assert.equal(resolveFormula("max(1, floor(@cl/2))d6", { cl: 5 }), "2d6");
assert.equal(resolveFormula("1d10 + floor(@cl/4)", { cl: 3 }), "1d10");
assert.equal(resolveFormula("2d6 + -1", {}), "2d6 - 1");
render("templates/apps/browser.hbs", { tabs: [{ id: "spells", label: "Spells", icon: "fa-x", active: true }], q: "fire", filters: [{ name: "level", label: "Level", options: [{ value: 1, label: "1st", selected: true }] }], total: 1, shown: 1, rows: [{ uuid: "x", name: "Fireball", img: "", meta: "3rd level" }], canAdd: true, actorName: "Wiz" });
const { levelPreview } = await import("../arneyan/module/progression.mjs");
const lp = levelPreview(mage, wiz5, 5, 7, 0, true, 3);
assert.ok(lp.includes("Character level <strong>5</strong> to <strong>7</strong>") && lp.includes("4th-level slots unlocked"), lp);
// Party sheet with two members and a stash item.
const { PartyData } = await import("../arneyan/module/data/actor-models.mjs");
const { ArneyanPartySheet } = await import("../arneyan/module/party.mjs");
hero.id = "hero1"; mage.id = "mage1";
for (const a of [hero, mage]) { a.testUserPermission = () => true; a.img = "x.png"; a.name = a === hero ? "Hero" : "Mage"; }
const pcFolder = { id: "pcs", name: "Player Characters", type: "Actor", folder: null };
hero.folder = pcFolder; mage.folder = pcFolder; hero.type = "character"; mage.type = "character";
const actorMap = new Map([["hero1", hero], ["mage1", mage]]);
actorMap.filter = fn => [...actorMap.values()].filter(fn);
globalThis.game.actors = actorMap;
globalThis.game.folders = new Map([["pcs", pcFolder]]);
globalThis.game.folders.find = fn => [...globalThis.game.folders.values()].find(fn);
globalThis.game.settings.get = (scope, key) => (key === "partyFolderId" ? "pcs" : "");
globalThis.game.user.isGM = true;
const rope = makeItem(IM.EquipmentData, "equipment", "Rope", { quantity: 1, slots: 1 });
const party = makeActor(PartyData, "party", { members: ["hero1", "mage1", "gone"], currency: { gp: 10 } }, [rope]);
party.items.contents = party.items;
const pctx = await sheetContext(ArneyanPartySheet, party, { _activeTab: "stash" });
assert.equal(pctx.members.length, 2, "missing members are skipped");
// Storage places: a chest back home with a Bag of Holding in it, a capacity, coins and a ledger.
const { StorageData, storageSlots } = await import("../arneyan/module/data/actor-models.mjs");
const { ArneyanStorageSheet, canUseStorage, fitsIn } = await import("../arneyan/module/storage.mjs");
const bagS = makeItem(IM.EquipmentData, "equipment", "Bag of Holding", { quantity: 1, slots: 1, container: { holds: true, capacity: 8, weightless: true, extradimensional: true } });
const goldS = makeItem(IM.EquipmentData, "equipment", "Gold Idol", { quantity: 1, slots: 3, inside: "BagofHolding" });
const ropeS = makeItem(IM.EquipmentData, "equipment", "Rope Coil", { quantity: 2, slots: 1 });
assert.equal(storageSlots([bagS, goldS, ropeS], { gp: 150 }), 1 + 2 + 2, "the bag's contents are free; 150 coins take 2 slots");
const chest = makeActor(StorageData, "storage", { kind: "home", location: "The cottage in Tariel", capacity: 6, here: false, currency: { gp: 150 },
  ledger: [{ when: "Day 1, 09:00", worldTime: 0, who: "Kieran", text: "Put in Rope Coil × 2" }] }, [bagS, goldS, ropeS]);
chest.testUserPermission = () => true; chest.name = "Home Chest";
assert.equal(chest.system.usedSlots, 5); assert.equal(fitsIn(chest, 1), true); assert.equal(fitsIn(chest, 2), false, "capacity 6");
globalThis.game.user.isGM = false;
assert.equal(canUseStorage(chest), false, "away: look, don't touch");
chest.system.here = true;
assert.equal(canUseStorage(chest), true);
chest.system.here = false;
const sctx = await sheetContext(ArneyanStorageSheet, chest, { _activeTab: "contents" });
assert.equal(sctx.usable, false); assert.ok(sctx.awayText.includes("Home Chest"));
assert.deepEqual(sctx.rows.map(r => [r.name, r.depth]), [["Bag of Holding", 0], ["Gold Idol", 1], ["Rope Coil", 0]], "contents sit under their container");
const shtml = render("templates/actor/storage-sheet.hbs", sctx);
assert.ok(shtml.includes("Party is away") && shtml.includes("The cottage in Tariel") && shtml.includes("5 of 6 slots") && !shtml.includes('data-action="takeItem"'), "away: no Take buttons");
globalThis.game.user.isGM = true;
const sctx2 = await sheetContext(ArneyanStorageSheet, chest, { _activeTab: "ledger" });
const shtml2 = render("templates/actor/storage-sheet.hbs", sctx2);
if (process.env.ARN_DUMP) fs.writeFileSync(process.env.ARN_DUMP, shtml2);
assert.ok(shtml2.includes("Put in Rope Coil") && shtml2.includes('data-action="takeItem"') && shtml2.includes("Party arrives"), "the GM can always use it, and sees the ledger and the switch");
// A character in Allies, Mounts & Pets travels with the party but isn't a member.
const { partyMembers } = await import("../arneyan/module/party.mjs");
const allyFolder = { id: "allies", name: "Allies, Mounts & Pets", type: "Actor", folder: pcFolder };
globalThis.game.folders.set("allies", allyFolder);
const ally = { id: "ally1", type: "character", folder: allyFolder, name: "Hireling", sort: 0 };
actorMap.set("ally1", ally);
assert.deepEqual(partyMembers().map(a => a.id).sort(), ["hero1", "mage1"]);
actorMap.delete("ally1");
const phtml = render("templates/actor/party-sheet.hbs", pctx);
assert.ok(phtml.includes("Hero") && phtml.includes("Rope") && phtml.includes("Travel speed 15"), "party sheet shows members, stash and the slowest speed");
// Encounter budget (M&T Building Encounters).
const { encounterBudget, creatureCost } = await import("../arneyan/module/encounter.mjs");
assert.equal(creatureCost(5, 5), 1); assert.equal(creatureCost(7, 5), 2); assert.equal(creatureCost(1, 6), 0.25); assert.equal(creatureCost(10, 5), null);
let eb = encounterBudget([5, 5, 5, 5], [{ name: "Ogre", level: 6, count: 2 }, { name: "Goblin", level: 2, count: 1 }]);
assert.equal(eb.total, 3.33); assert.equal(eb.label, "Between easy and hard");
eb = encounterBudget([5, 5, 5, 5], [{ name: "Goblin", level: 3, count: 6 }]);
assert.equal(eb.total, 6 * 0.5 + 2 * 0.5, "two goblins beyond the party's four cost double");
eb = encounterBudget([5, 5, 5, 5], [{ name: "Dragon", level: 5, solo: true, count: 1 }]);
assert.equal(eb.total, 4); assert.equal(eb.label, "Hard");
render("templates/apps/encounter.hbs", { b: eb, party: [{ name: "Hero", img: "", level: 5 }], foes: [{ i: 0, name: "Dragon", img: "", level: 5, solo: true, count: 1, cost: "1 × party" }], pct: 50 });
// Fractional Levels: ½ costs as Level -1, ¼ as Level -3.
assert.equal(creatureCost(0, 1, "½"), 0.5); assert.equal(creatureCost(0, 1, "¼"), 0.25); assert.equal(creatureCost(0, 3, "½"), 0.25);
// Far below (M&T p.3): 6 or more Levels under the party costs nothing and is never part of a crowd. The book's
// example: three goblins (¼, so Level −3) against a 12th-level character cost 0, not 1¼.
assert.equal(creatureCost(6, 12), 0, "6 below: free"); assert.equal(creatureCost(7, 12), 0.25, "5 below: ¼");
assert.equal(creatureCost(0, 3, "¼"), 0, "Level ¼ counts as −3: 6 below a 3rd-level party");
eb = encounterBudget([12], [{ name: "Goblin", level: 0, levelText: "¼", count: 3 }]);
assert.equal(eb.total, 0); assert.ok(eb.warnings.some(w => w.includes("no cost")));
assert.equal(eb.label, "Easy (all far below)"); assert.equal(eb.tier, "easy");
assert.equal(encounterBudget([12], []).label, "No foes");
assert.ok(encounterBudget([12], [{ name: "Wyrmling", level: 1, solo: true, count: 1 }]).warnings.some(w => w.includes("no cost")), "a solo far below is free too");
eb = encounterBudget([12], [{ name: "Goblin", level: 0, levelText: "¼", count: 3 }, { name: "Ogre", level: 12, count: 2 }]);
assert.equal(eb.total, 3, "the goblins don't make a crowd: only the second ogre doubles");
// A real monster from the pack: data model, traits, spell DC and every sheet tab.
const mdir = new URL("../packs-src/monsters/", import.meta.url).pathname;
const lichDoc = JSON.parse(fs.readFileSync(mdir + fs.readdirSync(mdir).find(f => f.startsWith("actors_Lich_"))));
const itemModels = { ability: IM.AbilityData, weapon: IM.WeaponData, spell: IM.SpellData, skill: IM.SkillData };
const lich = makeActor(NpcData, "npc", lichDoc.system, lichDoc.items.map(i => makeItem(itemModels[i.type], i.type, i.name, i.system)));
assert.equal(lich.system.spellDC, 21, "stat block spell DC (books v0.10.11: \"spell DC 21\")");
assert.ok(lich.system.traits.immune.includes("condition:charmed") && lich.system.traits.resist.includes("cold 5"));
for (const t of ["actions", "spells", "effects", "bio"]) {
  const ctx = await sheetContext(ArneyanActorSheet, lich, { _activeTab: t });
  const html = render("templates/actor/actor-sheet.hbs", ctx);
  assert.ok(html.includes("Fireball") && html.includes("Level 16") && html.includes("Charmed"), `lich sheet ${t}`);
  // Books v0.10.5: its scores and Skills line (Spellcraft: Int 20, +4).
  assert.ok(html.includes("arn-npc-skills") && html.includes("Spellcraft") && !html.includes(">–<"), `lich skills ${t}`);
}
const kobDoc = JSON.parse(fs.readFileSync(mdir + fs.readdirSync(mdir).find(f => f.startsWith("actors_Kobold_"))));
const kob = makeActor(NpcData, "npc", kobDoc.system, kobDoc.items.map(i => makeItem(itemModels[i.type], i.type, i.name, i.system)));
assert.ok(render("templates/actor/actor-sheet.hbs", await sheetContext(ArneyanActorSheet, kob, {})).includes("Level ¼"));
// Monster defences parsed from the book (the reviewer's cases).
const monster = name => JSON.parse(fs.readFileSync(mdir + fs.readdirSync(mdir).find(f => f.startsWith(`actors_${name.replace(/\W+/g, "_")}_`)))).system.details;
assert.ok(monster("Iron Golem").immunities.split(", ").includes("non-magical"));
assert.ok(monster("Flameskull").immunities.includes("fire") && monster("Flameskull").resistances.includes("piercing 5"));
assert.equal(monster("Wraith").resistances, "non-magical 10, acid 5, cold 5, fire 5, lightning 5, thunder 5");
assert.ok(!monster("Demilich").resistances.includes("force") && !monster("Demilich").resistances.includes("radiant") && monster("Demilich").resistances.includes("fire 10"));
assert.equal(monster("Treant").vulnerabilities, "fire");
assert.equal(monster("Gargoyle").resistances, "non-adamantine 5");
assert.equal(monster("Werewolf").resistances, "non-silvered 10");
assert.ok(monster("Bearded Devil").immunities.includes("condition:frightened") && !monster("Berserker").immunities.includes("frightened"));
// Which weapons each weapon resistance covers.
for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
const { weaponTrait } = await import("../arneyan/module/documents.mjs");
assert.ok(weaponTrait("non-magical", "slashing", "plain") && !weaponTrait("non-magical", "slashing", "magic") && !weaponTrait("non-magical", "fire", "plain"));
assert.ok(weaponTrait("non-silvered", "piercing", "plain") && !weaponTrait("non-silvered", "piercing", "silver"));
assert.ok(weaponTrait("weapons", "bludgeoning", "magic") && !weaponTrait("weapons", "bludgeoning", ""));
// Changing shape: the form's stat block, the creature's own mind, and objects.
const { formData } = await import("../arneyan/module/transform.mjs");
const druidSrc = { name: "Ilsa", type: "character", img: "i.png", system: { abilities: { int: { value: 12 }, wis: { value: 17 }, cha: { value: 9 }, str: { value: 10 } } },
  items: [{ _id: "a1", name: "Wild Shape", type: "ability" }, { _id: "s1", name: "Entangle", type: "spell", system: { className: "Druid" } }, { _id: "c1", name: "Druid", type: "class" }],
  effects: [], ownership: { default: 0, u1: 3 }, prototypeToken: { name: "Ilsa", disposition: 1 }, flags: {} };
const druid = { name: "Ilsa", type: "character", uuid: "Actor.d", toObject: () => JSON.parse(JSON.stringify(druidSrc)),
  effects: { contents: [{ flags: {}, toObject: () => ({ _id: "e1", name: "Bless" }) }, { flags: { arneyan: { concentration: true } }, toObject: () => ({ _id: "e2", name: "Concentrating" }) }] },
  system: { ...druidSrc.system, attributes: { hp: { value: 23 } }, spellDC: 15 } };
const wolfDoc = JSON.parse(fs.readFileSync(mdir + fs.readdirSync(mdir).find(f => f.startsWith("actors_Wolf_"))));
const wolf = { ...wolfDoc, uuid: "Compendium.arneyan.monsters.Actor.w", toObject: () => JSON.parse(JSON.stringify(wolfDoc)) };
let fd = formData(druid, wolf, { keepMind: true });
assert.equal(fd.name, "Ilsa (Wolf)"); assert.equal(fd.type, "npc"); assert.equal(fd.system.abilities.wis.value, 17);
assert.equal(fd.system.attributes.hp.max, wolfDoc.system.attributes.hp.max, "the form's HP");
assert.ok(fd.items.length && fd.items.every(i => !["class", "spell"].includes(i.type)));
assert.deepEqual(fd.effects.map(e => e.name), ["Bless"], "effects carried, concentration stays behind");
assert.equal(fd.prototypeToken.disposition, 1); assert.equal(fd.ownership.u1, 3); assert.equal(fd.flags.arneyan.transform.originalUuid, "Actor.d");
fd = formData(druid, wolf, { keepSpells: true, keepFeatures: true });
assert.ok(fd.items.some(i => i.name === "Entangle") && fd.items.some(i => i.name === "Wild Shape")); assert.equal(fd.system.attributes.spellDC, 15);
fd = formData(druid, null, { object: "teapot" });
assert.equal(fd.name, "Ilsa (a teapot)"); assert.equal(fd.type, "character");
assert.ok(fd.effects.some(e => e.statuses?.includes("paralysed")) && fd.items.some(i => i._id === "c1"), "an object keeps its own stats and is helpless");
// Token vision and size.
const { sensesRange } = await import("../arneyan/module/tokens.mjs");
assert.equal(sensesRange(["Darkvision 60ft", "Truesight 120ft"]), 120); assert.equal(sensesRange(["Tremorsense 30ft"]), 0);
assert.equal(ARNEYAN.tokenSizes.huge, 3);
assert.equal(JSON.parse(fs.readFileSync(mdir + fs.readdirSync(mdir).find(f => f.startsWith("actors_Ogre_")))).system.details.size, "large");
const goblinDoc = JSON.parse(fs.readFileSync(mdir + fs.readdirSync(mdir).find(f => f.startsWith("actors_Goblin_"))));
assert.equal(goblinDoc.prototypeToken.sight.range, 60); assert.equal(goblinDoc.prototypeToken.sight.visionMode, "darkvision");
// Vision types.
const { visionFrom } = await import("../arneyan/module/tokens.mjs");
let vf = visionFrom(["Darkvision 60ft", "Tremorsense 30ft"]);
assert.equal(vf.mode, "darkvision"); assert.equal(vf.range, 60); assert.deepEqual(vf.detect, [{ id: "feelTremor", range: 30, enabled: true }]);
assert.equal(visionFrom(["Low-Light"]).mode, "lightAmplification");
assert.equal(visionFrom(["Truesight 120ft"]).detect[0].id, "seeAll");
// Vision is put on the prepared token: Foundry 13 lists detection modes, Foundry 14 keys them by id.
const { applyVision } = await import("../arneyan/module/tokens.mjs");
let tk = applyVision({ sight: { enabled: false, range: 0, visionMode: "basic", saturation: 0 }, detectionModes: [{ id: "basicSight", enabled: true, range: 0 }] },
  visionFrom(["Darkvision 60ft", "Tremorsense 30ft"]), { range: 0, visionMode: "basic" }, { saturation: -1 });
assert.deepEqual([tk.sight.enabled, tk.sight.range, tk.sight.visionMode, tk.sight.saturation], [true, 60, "darkvision", -1]);
assert.equal(tk.detectionModes.find(m => m.id === "basicSight").range, 60); assert.equal(tk.detectionModes.find(m => m.id === "feelTremor").range, 30);
tk = applyVision({ sight: { enabled: true, range: 0, visionMode: "basic" }, detectionModes: { basicSight: { enabled: true, range: null } } },
  visionFrom(["Truesight 120ft"]), {});
assert.equal(tk.detectionModes.seeAll.range, 120); assert.equal(tk.detectionModes.basicSight.range, null, "unlimited stays unlimited");
assert.equal(tk.sight.range, 120);
tk = applyVision({ sight: { enabled: true, range: 90, visionMode: "tremorsense" }, detectionModes: {} }, visionFrom(["Darkvision 60ft"]), { range: 90, visionMode: "tremorsense" });
assert.deepEqual([tk.sight.range, tk.sight.visionMode], [90, "tremorsense"], "a longer range and a mode set by hand stay");
tk = applyVision({ sight: { enabled: true, range: 60, visionMode: "darkvision" }, detectionModes: [] }, visionFrom([]), { range: 0, visionMode: "basic" });
assert.deepEqual([tk.sight.range, tk.sight.visionMode], [0, "basic"], "prepared again after losing Darkvision");
assert.ok(!("detectionModes" in goblinDoc.prototypeToken), "the Bestiary stores no detection modes (Foundry 13 and 14 differ)");
// The system's compendiums can't be changed, down to an item inside a monster in one.
const { inSystemPack } = await import("../arneyan/module/protect.mjs");
assert.equal(inSystemPack({ pack: "arneyan.monsters" }), true);
assert.equal(inSystemPack({ pack: null, parent: { pack: "arneyan.monsters" } }), true, "an item on a Bestiary monster");
assert.equal(inSystemPack({ pack: "world.my-monsters" }), false);
assert.equal(inSystemPack({ pack: null, parent: null }), false, "world documents are free to change");
// Silver and adamantine are materials on the weapon sheet and in the forge.
assert.deepEqual(Object.keys(ARNEYAN.weaponMaterials), ["Silvered", "Adamantine", "Cold iron", "Mithral", "Nalwood"]);
// Damage of several types meets resistances one type at a time.
const { ArneyanActor } = await import("../arneyan/module/documents.mjs");
const dummy = Object.create(ArneyanActor.prototype);
let saved = null;
Object.assign(dummy, { name: "Troll", type: "npc", effects: [], update: async d => { saved = d; }, _syncDowned: async () => {} });
Object.defineProperty(dummy, "system", { value: { attributes: { hp: { value: 30, max: 30, temp: 0 } }, traits: { resist: ["fire 5"], immune: ["poison"], vuln: ["acid"] }, dr: 0 } });
let res = await dummy.applyDamage(0, { parts: [{ type: "slashing", amount: 7 }, { type: "fire", amount: 8 }, { type: "poison", amount: 4 }, { type: "acid", amount: 2 }] });
assert.equal(saved["system.attributes.hp.value"], 30 - (7 + 3 + 0 + 4));
assert.ok(res.line.includes("takes 14 damage: 7 slashing, 3 fire, 4 acid") && res.line.includes("resists fire 5") && res.line.includes("immune to poison"), res.line);
res = await dummy.applyDamage(6, { type: "cold" });
assert.ok(res.line.startsWith("Troll takes 6 cold damage"), res.line);
// One hit, one instance: "all 5" comes off once; halving rounds down once at the end.
dummy.system.traits = { resist: ["all 5"], immune: [], vuln: [] }; dummy.system.attributes.hp.value = 30;
res = await dummy.applyDamage(0, { parts: [{ type: "slashing", amount: 7 }, { type: "fire", amount: 4 }] });
assert.equal(saved["system.attributes.hp.value"], 30 - 6, res.line);
dummy.system.traits = { resist: [], immune: [], vuln: [] };
await dummy.applyDamage(0, { mult: 0.5, parts: [{ type: "slashing", amount: 7 }, { type: "fire", amount: 3 }, { type: "cold", amount: 4 }] });
assert.equal(saved["system.attributes.hp.value"], 30 - 7);
// Healing below 0 starts from 0.
dummy.system.attributes.hp.value = -6;
await dummy.applyDamage(4, { mult: -1 });
assert.equal(saved["system.attributes.hp.value"], 4);
// Drop 1: bundles, containers, encumbrance, ammunition.
const { stackSlots } = IM;
assert.equal(stackSlots({ quantity: 31, slots: 1, bundle: 30 }), 2); assert.equal(stackSlots({ quantity: 3, slots: 2, bundle: 0 }), 6); assert.equal(stackSlots({ quantity: 0, slots: 1, bundle: 5 }), 0);
const bag = makeItem(IM.EquipmentData, "equipment", "Bag of Holding", { quantity: 1, slots: 1, container: { holds: true, capacity: 8, weightless: true, extradimensional: true } });
const rocks = makeItem(IM.EquipmentData, "equipment", "Rocks", { quantity: 6, slots: 1, inside: "BagofHolding" });
const quiverArrows = makeItem(IM.EquipmentData, "equipment", "Arrows", { quantity: 20, slots: 1, bundle: 30, ammoType: "arrow" });
const bow = makeItem(IM.WeaponData, "weapon", "Bow, Long", { damage: "1d8", damageType: "piercing", ranged: true, ammoType: "arrow" });
const packer = makeActor(CharacterData, "character", { abilities: { str: { value: 10 } } }, [bag, rocks, quiverArrows, bow]);
assert.equal(packer.system.inventory.used, 1 + 1 + 1, "bag 1 + arrows 1 + bow 1; the rocks in the bag cost nothing");
assert.equal(bag.system.contents, 6);
const { ammoFor } = await import("../arneyan/module/gear.mjs");
assert.equal(ammoFor(packer, bow)?.name, "Arrows");
const pile = Array.from({ length: 20 }, (_, n) => makeItem(IM.EquipmentData, "equipment", `Brick${n}`, { quantity: 1, slots: 1 }));
const mule = makeActor(CharacterData, "character", { abilities: { str: { value: 10 } } }, pile);
assert.ok(mule.system.inventory.over && mule.system.mods.adv("adv.attack").dis.includes("Over the inventory limit") && mule.system.mods.adv("adv.check.dex").values.includes(-1));
const gctx = await sheetContext(ArneyanActorSheet, packer, { _activeTab: "gear" });
const ghtml = render("templates/actor/actor-sheet.hbs", gctx);
assert.ok(ghtml.includes('data-container-id="BagofHolding"') && ghtml.includes("6 / 8 slots stowed") && ghtml.includes("Rocks"), "the bag lists what's inside");
assert.deepEqual(gctx.gear.containers.map(c => c.name), ["Bag of Holding"]); assert.deepEqual(gctx.gear.containers[0].children.map(c => c.name), ["Rocks"]);
assert.deepEqual(gctx.gear.consumables.map(c => c.name), ["Arrows"], "ammunition on your person is a consumable");
assert.deepEqual(gctx.gear.weapons.map(c => c.name), ["Bow, Long"], "an unequipped bow is carried");
// Over the limit: −10ft, and another −10ft for every 5 slots over.
assert.equal(mule.system.inventory.overBy, 2); assert.equal(mule.system.inventory.speedPenalty, 10);
const mule2 = makeActor(CharacterData, "character", { abilities: { str: { value: 10 } } }, Array.from({ length: 25 }, (_, n) => makeItem(IM.EquipmentData, "equipment", `Stone${n}`, { quantity: 1, slots: 1 })));
assert.equal(mule2.system.inventory.overBy, 7); assert.equal(mule2.system.inventory.speedPenalty, 20);
const mule3 = makeActor(CharacterData, "character", { abilities: { str: { value: 10 } } }, Array.from({ length: 60 }, (_, n) => makeItem(IM.EquipmentData, "equipment", `Ore${n}`, { quantity: 1, slots: 1 })));
assert.equal(mule3.system.attributes.speedNow, 0, "speed never goes below 0");
// A pouch inside a Bag of Holding: what's in the pouch costs nothing either, and counts towards the bag.
const bag2 = makeItem(IM.EquipmentData, "equipment", "Bag2", { quantity: 1, slots: 1, container: { holds: true, capacity: 8, weightless: true, extradimensional: true } });
const pouch = makeItem(IM.EquipmentData, "equipment", "Pouch", { quantity: 1, slots: 1, inside: "Bag2", container: { holds: true, capacity: 0, weightless: false, extradimensional: false } });
const gems = makeItem(IM.EquipmentData, "equipment", "Gems", { quantity: 3, slots: 1, inside: "Pouch" });
const hoarder = makeActor(CharacterData, "character", { abilities: { str: { value: 10 } } }, [bag2, pouch, gems]);
assert.equal(hoarder.system.inventory.used, 1); assert.equal(bag2.system.contents, 4); assert.equal(pouch.system.contents, 3);
// Shield: Magic Missile does nothing to a shielded target; other spells still hurt.
const shielded = Object.create(ArneyanActor.prototype);
Object.assign(shielded, { name: "Mage", type: "character", effects: [], update: async () => {}, _syncDowned: async () => {} });
Object.defineProperty(shielded, "system", { value: { attributes: { hp: { value: 20, max: 20, temp: 0 } }, traits: { resist: [], immune: ["spell:Magic Missile"], vuln: [] } } });
assert.ok((await shielded.applyDamage(5, { type: "force", spell: "Magic Missile" })).text.includes("immune to Magic Missile"));
assert.ok(!(await shielded.applyDamage(5, { type: "fire", spell: "Fireball" })).text.includes("immune"));
const shieldSpell = JSON.parse(fs.readFileSync("packs-src/spells/" + fs.readdirSync("packs-src/spells").find(f => /^items_Shield_[A-Za-z0-9]+\.json$/.test(f))));
assert.ok(shieldSpell.system.applies?.[0]?.rules.some(r => r.key === "immune" && r.value === "spell:Magic Missile"), "Shield's effect is approved and built");
// Wands and staffs know their spells; blank scrolls know their level.
const edir = "packs-src/equipment/";
const wandDoc = JSON.parse(fs.readFileSync(edir + fs.readdirSync(edir).find(f => f.startsWith("items_Wand_of_Magic_Missiles_"))));
assert.deepEqual(wandDoc.system.itemSpells, [{ name: "Magic Missile", cost: 1 }]); assert.equal(wandDoc.system.castLevel, 3);
const { blankScrollLevel } = await import("../arneyan/module/gear.mjs");
assert.equal(blankScrollLevel({ name: "Scroll, 3rd level", system: { scroll: { spell: null } } }), 3);
assert.equal(blankScrollLevel({ name: "Scroll, cantrip", system: { scroll: { spell: null } } }), 0);
assert.equal(blankScrollLevel({ name: "Scroll of Fireball", system: { scroll: { spell: { name: "Fireball" } } } }), null);
const torchDoc = JSON.parse(fs.readFileSync(edir + fs.readdirSync(edir).find(f => f.startsWith("items_Torches_"))));
assert.deepEqual([torchDoc.system.light.bright, torchDoc.system.light.dim, torchDoc.system.light.hours], [20, 40, 1]);
const packDoc = JSON.parse(fs.readFileSync(edir + fs.readdirSync(edir).find(f => f.startsWith("items_Backpack_"))));
assert.equal(packDoc.system.container.holds, true, "a backpack is a container");
// Old world copies get the new data once; anything already set stays.
const { fillFrom } = await import("../arneyan/module/migrate.mjs");
assert.deepEqual(Object.keys(fillFrom({ type: "equipment", system: { container: { holds: false }, light: { bright: 0, dim: 0 }, itemSpells: [] } }, packDoc)), ["system.container"]);
assert.equal(fillFrom({ type: "equipment", system: { light: { bright: 0, dim: 0 }, itemSpells: [] } }, torchDoc)["system.light.dim"], 40);
assert.deepEqual(fillFrom({ type: "equipment", system: { light: { bright: 10, dim: 10 }, itemSpells: [] } }, torchDoc), {}, "a light set by hand stays");
// 0.10.52: torches bundle 5 a slot, the Backpack takes no slot (Kieran, 25 Oct); old copies change once, a GM's own value stays.
assert.equal(torchDoc.system.bundle, 5); assert.equal(packDoc.system.slots, 0);
assert.deepEqual(fillFrom({ type: "equipment", name: "Torch", system: { slots: 1, bundle: 0, light: { bright: 20, dim: 40 }, itemSpells: [] } }, torchDoc), { "system.bundle": 5, "flags.arneyan.slotsSet": true });
assert.deepEqual(fillFrom({ type: "equipment", name: "Backpack", system: { slots: 1, container: { holds: true }, itemSpells: [] } }, packDoc), { "system.slots": 0, "flags.arneyan.slotsSet": true });
assert.deepEqual(fillFrom({ type: "equipment", name: "Backpack", system: { slots: 2, container: { holds: true }, itemSpells: [] } }, packDoc), {}, "a GM's slot value stays");
assert.deepEqual(fillFrom({ type: "equipment", name: "Backpack", flags: { arneyan: { slotsSet: true } }, system: { slots: 1, container: { holds: true }, itemSpells: [] } }, packDoc), {}, "only once");
// 0.10.60: Knives bundle 5 a slot (Kieran, 25 Oct); Daggers and Hand/Throwing Axes stay 1 each.
{
  const docOf = n => JSON.parse(fs.readFileSync(edir + fs.readdirSync(edir).find(f => new RegExp(`^items_${n}_[A-Za-z0-9]{16}\\.json$`).test(f))));
  const knifeDoc = docOf("Knife"), daggerDoc = docOf("Dagger"), axeDoc = docOf("Axe_Hand_Throwing");
  assert.deepEqual([knifeDoc.system.bundle, daggerDoc.system.bundle, axeDoc.system.bundle], [5, 0, 0]);
  const oldKnife = { type: "weapon", name: "Knife", system: { ...structuredClone(knifeDoc.system), bundle: 0 } };
  const upd = fillFrom(oldKnife, knifeDoc);
  assert.equal(upd["system.bundle"], 5); assert.equal(upd["flags.arneyan.slotsSet"], true);
  assert.equal(fillFrom({ ...oldKnife, flags: { arneyan: { slotsSet: true } } }, knifeDoc)["system.bundle"], undefined, "only once");
  assert.equal(fillFrom({ type: "weapon", name: "Dagger", system: structuredClone(daggerDoc.system) }, daggerDoc)["system.bundle"], undefined);
  // Scrolls bundle 5 a slot too; an inscribed copy of a blank Catalogue scroll changes once.
  const scrollDoc = docOf("Scroll_1st_level");
  assert.equal(scrollDoc.system.bundle, 5);
  const oldScroll = { type: "equipment", name: "Scroll of Sleep", system: { ...structuredClone(scrollDoc.system), bundle: 0 } };
  assert.equal(fillFrom(oldScroll, scrollDoc)["system.bundle"], 5);
  assert.equal(fillFrom({ ...oldScroll, flags: { arneyan: { slotsSet: true } } }, scrollDoc)["system.bundle"], undefined, "a scroll changes only once");
  assert.equal(fillFrom({ ...oldKnife, system: { ...oldKnife.system, slots: 2 } }, knifeDoc)["system.bundle"], undefined, "a GM's slot value stays");
  assert.equal(fillFrom({ ...oldKnife, system: { ...oldKnife.system, bundle: 3 } }, knifeDoc)["system.bundle"], undefined, "a GM's bundle stays");
}
const { packSlots, STARTING_PACKS } = await import("../arneyan/module/starting.mjs");
{
  const info = new Map(fs.readdirSync(edir).filter(f => f.startsWith("items_")).map(f => JSON.parse(fs.readFileSync(edir + f))).map(d => [d.name, { slots: Number(d.system.slots) || 0, bundle: Number(d.system.bundle) || 0 }]));
  const by = Object.fromEntries(STARTING_PACKS.map(p => [p.name, packSlots(p, info)]));
  assert.equal(by["Explorer's Pack"], 8, "Explorer's Pack: 8 slots");
  assert.equal(by["Dungeoneer's Pack"], 11, "Dungeoneer's Pack: 11 slots");
  for (const [n, v] of Object.entries(by)) assert.ok(v <= 12, `${n} leaves room (${v} slots)`);
  console.log("OK starting packs fit", JSON.stringify(by));
}
assert.ok(fillFrom({ type: "spell", system: { applies: [] } }, shieldSpell)["system.applies"]);
// A monster's Shield has its effect too (effects are applied before monsters copy their spells).
const mageMon = fs.readdirSync(mdir).map(f => JSON.parse(fs.readFileSync(mdir + f))).find(d => d.items?.some(i => i.name === "Shield" && i.type === "spell"));
assert.ok(mageMon?.items.find(i => i.name === "Shield").system.applies?.length, `${mageMon?.name}'s Shield works`);
const magi = JSON.parse(fs.readFileSync(edir + fs.readdirSync(edir).find(f => f.startsWith("items_Staff_of_the_Magi_"))));
assert.deepEqual([magi.system.nonCasterCl, magi.system.nonCasterDc], [12, 18]);
// A homebrew wand: its spells and caster level on its sheet.
const { ArneyanItemSheet: ItemSheetT } = await import("../arneyan/module/sheets.mjs");
const myWand = makeItem(IM.EquipmentData, "equipment", "Wand of Frost", { quantity: 1, slots: 1, charges: { value: 5, max: 7, recharge: "", crumble: true }, itemSpells: [{ name: "Ray of Frost", cost: 1, uuid: "Item.abc" }, { name: "Cone of Cold", cost: 3, uuid: "" }], castLevel: 5 });
myWand._source.name = "Wand of Frost";
const wctx = await sheetContext(ItemSheetT, myWand, { _activeTab: "details" });
const whtml = render("templates/item/item-sheet.hbs", { ...wctx, editable: true });
assert.ok(whtml.includes("Spells it casts") && whtml.includes("Cone of Cold") && whtml.includes('data-uuid="Item.abc"') && whtml.includes('name="system.castLevel"'), "the wand's sheet lists its spells");
// Nalwood: the Weave falters, Disadvantage to hold concentration.
const conc = Object.create(ArneyanActor.prototype);
let concCard = null;
globalThis.ChatMessage = { create: async d => { concCard = d; }, getSpeaker: () => ({}) };
Object.assign(conc, { name: "Cultist", type: "npc", uuid: "Actor.c", update: async () => {}, _syncDowned: async () => {} });
conc.effects = [{ flags: { arneyan: { concentration: true } } }];
Object.defineProperty(conc, "system", { value: { attributes: { hp: { value: 20, max: 20, temp: 0 } }, traits: { resist: [], immune: [], vuln: [] } } });
await conc.applyDamage(6, { type: "piercing", weapon: "plain", disrupt: true });
assert.ok(concCard?.content.includes('data-disrupted="1"') && concCard.content.includes("Nalwood"), "a Nalwood wound makes the concentration save harder");
// The Catalogue compendium: no rules text as items, Linkbreaker in one piece, a torch, eight groups.
const eqDocs = fs.readdirSync(edir).map(f => JSON.parse(fs.readFileSync(edir + f)));
assert.ok(!eqDocs.some(d => ["Rules", "Availability", "Costly components", "Curses", "Selling"].includes(d.name)), "rules text isn't an item");
const lb = eqDocs.find(d => d.name === "Linkbreaker");
assert.ok(lb?.type === "weapon" && lb.system.magic === 2 && /Break the Chain/.test(lb.system.description));
assert.ok(eqDocs.some(d => d.name === "Torch") && !eqDocs.some(d => d.name === "Torches"));
assert.deepEqual(eqDocs.filter(d => d._key.startsWith("!folders!") && !d.folder).sort((a, b) => a.sort - b.sort).map(d => d.name),
  ["Weapons", "Armour & Shields", "Magic Items", "Alchemy & Poisons", "Spell Components", "Adventuring Gear", "Food & Drink", "Tools & Trades"]);
// Flame Tongue: an Ignited mode with its fire tied to it; older copies get it once.
const ft = eqDocs.find(d => d.name === "Flame Tongue");
assert.deepEqual([ft.system.toggle, ft.system.modeLabel, ft.system.modeLight, ft.system.bonusDamage[0].mode], [true, "Ignited", 20, true]);
assert.equal(fillFrom({ type: "weapon", system: { modeLabel: "" } }, ft)["system.modeLabel"], "Ignited");
// Dragons: Kanka's blindsight by age.
const adultRed = fs.readdirSync(mdir).map(f => JSON.parse(fs.readFileSync(mdir + f))).find(d => d.name === "Red Dragon, Adult");
assert.ok(adultRed.system.details.senses.includes("Blindsight 60ft"));
// Ready-made weapon modes: the forge and the weapon sheet put one in, replacing any old mode damage.
const { withMode } = await import("../arneyan/module/forge.mjs");
const wm = withMode({ bonusDamage: [{ formula: "2d6", type: "radiant", when: "against undead", mode: false }, { formula: "1d4", type: "cold", when: "", mode: true }] }, ARNEYAN.weaponModes.flaming);
assert.deepEqual([wm.toggle, wm.modeLabel, wm.modeLight], [true, "Ignited", 20]);
assert.deepEqual(wm.bonusDamage.map(b => `${b.formula} ${b.type} ${b.mode}`), ["2d6 radiant false", "1d6 fire true"]);

{
// Auras: radius formulas, distance between tokens' nearest squares, who an aura touches.
globalThis.Roll ??= class {};
Roll.safeEval ??= expr => Function(`"use strict"; return (${expr});`)();
globalThis.CONST ??= {};
CONST.TOKEN_DISPOSITIONS ??= { FRIENDLY: 1, NEUTRAL: 0, HOSTILE: -1 };
const { evalRadius, gapFeet, inAura, aurasOf } = await import("../arneyan/module/auras.mjs");
const courage = [[1, 10], [15, 30], [20, 50]];
assert.deepEqual([6, 15, 20].map(l => evalRadius(courage, l)), [10, 30, 50]);
const atk = (id, x, y, disposition = 1, w = 1) => ({ id, x: x * 100, y: y * 100, width: w, height: w, disposition });
assert.equal(gapFeet(atk("a", 0, 0), atk("b", 2, 1), 100, 5), 10);   // two squares away, diagonals count as one
assert.equal(gapFeet(atk("a", 0, 0, 1, 2), atk("b", 4, 0), 100, 5), 15); // from a Large creature's edge: the third square out
const ally = { radius: 10, def: { who: "allies", includeSelf: false } };
assert.ok(inAura(ally, atk("p", 0, 0), atk("f", 2, 0), 100, 5));
assert.ok(!inAura(ally, atk("p", 0, 0), atk("f", 3, 0), 100, 5));
assert.ok(!inAura(ally, atk("p", 0, 0), atk("g", 1, 0, -1), 100, 5), "allies only");
assert.ok(!inAura(ally, atk("p", 0, 0), atk("p", 0, 0), 100, 5), "not the paladin herself");
assert.ok(inAura({ radius: 15, def: { who: "enemies" } }, atk("c", 0, 0), atk("g", 3, 0, -1), 100, 5));
assert.ok(!inAura({ radius: 15, def: { who: "enemies" } }, atk("c", 0, 0), atk("n", 1, 0, 0), 100, 5), "neutrals aren't enemies");
const cfDir = new URL("../packs-src/class-features/", import.meta.url).pathname;
const divProt = fs.readdirSync(cfDir).map(f => JSON.parse(fs.readFileSync(cfDir + f))).find(d => d.name === "Divine Protection");
const pal = { items: [{ type: "class", name: "Paladin", system: { levels: 7 } }, { ...divProt, id: "dp" }], effects: [], system: { level: 7 } };
assert.deepEqual(aurasOf(pal).map(a => `${a.def.name} ${a.radius}`), ["Aura of Courage 10"]);
pal.items[0].system.levels = 5;
assert.equal(aurasOf(pal).length, 0, "Aura of Courage starts at 6th level");
const guardianFx = { disabled: false, name: "Spirit Guardians", id: "e1", flags: { arneyan: { aura: [{ name: "Spirit Guardians", radius: 15, who: "enemies", turn: { save: "will" } }], cl: 5, dc: 15 } } };
assert.equal(aurasOf({ items: [], effects: [guardianFx] })[0].dc, 15);
const pitFiend = fs.readdirSync(mdir).map(f => JSON.parse(fs.readFileSync(mdir + f))).find(d => d.name === "Pit Fiend");
const fear = pitFiend.items.find(i => i.system.auras?.length).system.auras[0];
assert.deepEqual([fear.radius, fear.turn.save, fear.turn.dc, fear.turn.status], [20, "will", 24, "frightened"], "Fear Aura DC 24 (books v0.10.8 DCs)");
// Spell areas: Fireball a 20ft circle; Place area on its card.
const spDir = new URL("../packs-src/spells/", import.meta.url).pathname;
const spells = fs.readdirSync(spDir).map(f => JSON.parse(fs.readFileSync(spDir + f)));
const fb = spells.find(d => d.name === "Fireball");
assert.deepEqual([fb.system.template.type, fb.system.template.size, fb.system.template.lingering], ["circle", 20, false]);
assert.deepEqual(spells.find(d => d.name === "Spirit Guardians").system.template.attached, true);
const { areaButton, tokenInside } = await import("../arneyan/module/areas.mjs");
const abtn = areaButton(fb, { actor: { uuid: "Actor.w" }, dc: 15, cl: 9, formula: "9d6" });
assert.ok(abtn.includes("arn-place-area") && abtn.includes("20ft radius"));
const bd = JSON.parse(abtn.match(/data-area="([^"]*)"/)[1].replace(/&quot;/g, '"'));
assert.deepEqual([bd.save, bd.dc, bd.formula, bd.half], [fb.system.save, 15, "9d6", /half/i.test(fb.system.saveEffect)]);
assert.equal(areaButton({ name: "Bless", system: { template: { type: "" } } }, { actor: {} }), "");
// A creature is inside if any of its squares is.
const region = { documentName: "Region", testPoint: p => p.x < 300 };
assert.ok(tokenInside(region, { x: 200, y: 0, width: 2, height: 2, elevation: 0, parent: { grid: { size: 100 } } }));
assert.ok(!tokenInside(region, { x: 300, y: 0, width: 1, height: 1, elevation: 0, parent: { grid: { size: 100 } } }));
}
// Vision by D&D 5e (Kieran, 19 Oct): the Hill Giant has none, a Balor has Truesight 120ft, a young dragon Darkvision 120ft.
const byName = n => fs.readdirSync(mdir).map(f => JSON.parse(fs.readFileSync(mdir + f))).find(d => d.name === n);
assert.deepEqual(byName("Hill Giant").system.details.senses, "");
assert.ok(/Truesight 120ft/.test(byName("Balor").system.details.senses) && !/Darkvision/.test(byName("Balor").system.details.senses));
assert.ok(/Darkvision 120ft/.test(byName("Red Dragon, Young").system.details.senses));
{
// v0.7.1: older spell copies still get Place area; durations; the aura editor's radius text; Shaken; migration.
const { areaFromText, roundsFor } = await import("../arneyan/module/areas.mjs");
assert.deepEqual(areaFromText("20ft radius").type, "circle");
assert.deepEqual([areaFromText("100ft line, 5ft wide").size, areaFromText("15ft cone").fromSelf], [100, true]);
assert.equal(areaFromText("one creature"), null);
assert.deepEqual([roundsFor("1*@cl", 7), roundsFor("min(1*@cl, 10)", 14), roundsFor("100", 3), roundsFor("", 3)], [7, 10, 100, 0]);
const spDir2 = new URL("../packs-src/spells/", import.meta.url).pathname;
const sp2 = fs.readdirSync(spDir2).map(f => JSON.parse(fs.readFileSync(spDir2 + f))).filter(d => d.system);
assert.equal(sp2.find(d => d.name === "Burning Hands").system.template.fromSelf, true, "a cone starts from the caster");
assert.equal(sp2.find(d => d.name === "Stinking Cloud").system.template.rounds, "1*@cl");
assert.equal(sp2.find(d => d.name === "Web").system.template.rounds, "100*@cl");
const { radiusText, parseRadius } = await import("../arneyan/module/sheets.mjs");
const steps = [[1, 10], [15, 30], [20, 50]];
assert.equal(radiusText(steps), "10; 30 at 15; 50 at 20");
assert.deepEqual(parseRadius("10; 30 at 15; 50 at 20"), steps);
assert.deepEqual([parseRadius("15"), parseRadius("@cl*5")], [15, "@cl*5"]);
const boneDevil = fs.readdirSync(mdir).map(f => JSON.parse(fs.readFileSync(mdir + f))).find(d => d.name === "Bone Devil");
assert.equal(boneDevil.items.find(i => i.system.auras?.length).system.auras[0].turn.status, "shaken");
assert.ok(ARNEYAN.conditions.shaken && ARNEYAN.conditions.slowed && ARNEYAN.conditions.weakened && ARNEYAN.conditions.confused);
const fbSrc = sp2.find(d => d.name === "Fireball");
const upd = fillFrom({ type: "spell", system: { template: { type: "" }, area: "" } }, fbSrc);
assert.equal(upd["system.template"].type, "circle", "an old Fireball on a sheet gets its area");
assert.deepEqual(fillFrom({ type: "ability", system: { auras: [] } }, { system: { auras: [{ name: "Aura of Courage" }] } })["system.auras"][0].name, "Aura of Courage");
}
{
const auraItem = makeItem(IM.AbilityData, "ability", "Divine Protection", { auras: [{ key: "courage", name: "Aura of Courage", radius: [[1, 10], [15, 30], [20, 50]], who: "allies", minLevel: 6, rules: [{ key: "save", value: "4", when: "vs fear" }] }] });
auraItem._source.name = "Divine Protection";
const actx = await sheetContext(ItemSheetT, auraItem, { _activeTab: "effects" });
const ahtml = render("templates/item/item-sheet.hbs", { ...actx, editable: true });
assert.ok(ahtml.includes("arn-aura-entry") && ahtml.includes('value="10; 30 at 15; 50 at 20"') && ahtml.includes('data-action="auraAdd"') && ahtml.includes('data-apply="aura-0"'), "the aura editor shows the aura");
}
{
// Fireball's button: "(min(@cl,10))d6" at 12th level reads 10d6.
assert.equal(resolveFormula("(min(@cl,10))d6", { cl: 12 }), "10d6");
const dcard = render("templates/chat/damage-card.hbs", { title: "Fireball: Damage", type: "Fire", damageType: "fire", total: 31, formula: "10d6",
  diceGroups: [{ label: "10d6", subtotal: 31, dice: [3, 1, 2, 3, 2, 3, 5, 6, 2, 4].map(r => ({ result: r, faces: 6, max: r === 6, min: r === 1 })) }], parts: [], split: [], offers: [], notes: [] });
const summary = dcard.slice(dcard.indexOf("<summary"), dcard.indexOf("</summary>"));
assert.ok(summary.includes(">31<") && summary.includes("10d6") && !summary.includes("arn-die"), "the closed card shows the total and 10d6, the dice are in the breakdown");
assert.ok(dcard.includes("= 31") && dcard.includes("arn-die small  max"), "the breakdown lists the dice");
if (process.env.ARN_DUMP_CARD) fs.writeFileSync(process.env.ARN_DUMP_CARD, dcard);
}
{
// True circles, not grid squares; Earthquake grows with level; lights and objects aren't areas.
const { areaButton: ab } = await import("../arneyan/module/areas.mjs");
const spDir3 = new URL("../packs-src/spells/", import.meta.url).pathname;
const sp3 = fs.readdirSync(spDir3).map(f => JSON.parse(fs.readFileSync(spDir3 + f))).filter(d => d.system);
const eq = sp3.find(d => d.name === "Earthquake");
assert.equal(eq.system.template.sizeFormula, "min(5*@cl, 100)");
assert.ok(ab(eq, { actor: { uuid: "a" }, cl: 12 }).includes("60ft radius"));
assert.equal(sp3.find(d => d.name === "Daylight").system.template.type, "");
assert.equal(sp3.find(d => d.name === "Cone of Cold").system.template.type, "cone");
assert.ok(!fs.readFileSync(new URL("../arneyan/module/areas.mjs", import.meta.url)).toString().includes("gridBased: true"));
}
{
// Saves (Codex): attribute modifier + the greater of 1 and half the character level, + bonuses; "vs fear" stays a note.
const cls = (n, l) => makeItem(IM.ClassData, "class", n, { levels: l, hitDie: "d8", bthProgression: "martial", keyAbility: "str", xpRate: 10 });
const mk = (con, classes, items = [], fx = []) => makeActor(CharacterData, "character", { abilities: { str: { value: 10 }, dex: { value: 10 }, con: { value: con }, int: { value: 10 }, wis: { value: 10 }, cha: { value: 10 } } }, [...classes, ...items], fx);
assert.equal(mk(8, [cls("Fighter", 1)]).system.saves.fort.value, 0);           // -1 + 1 (minimum)
assert.equal(mk(13, [cls("Fighter", 3), cls("Wizard", 4)]).system.saves.fort.value, 4); // +1 + half of 7
assert.equal(mk(18, [cls("Fighter", 20)]).system.saves.fort.value, 13);
const fxs = [{ name: "Aura of Courage", disabled: false, flags: { arneyan: { rules: [{ key: "save", value: "4", when: "vs fear" }] } } }, { name: "Divine Monolith", disabled: false, flags: { arneyan: { rules: [{ key: "save", value: "2" }] } } }];
assert.equal(mk(16, [cls("Fighter", 5)], [], fxs).system.saves.fort.value, 6);  // 2 + 2 + Monolith 2; Courage only vs fear
}
{
// Pregens: 15 Broken Anvil characters in three level folders, 4 for Jacob's Well, built from the system's own items.
const pdir = new URL("../packs-src/pregens/", import.meta.url).pathname;
const pdocs = fs.readdirSync(pdir).map(f => JSON.parse(fs.readFileSync(pdir + f)));
const pf = pdocs.filter(d => d._key.startsWith("!folders!"));
const pa = pdocs.filter(d => d._key.startsWith("!actors!"));
assert.equal(pa.length, 19);
const byName = n => pf.find(f => f.name === n);
assert.deepEqual(pf.filter(f => f.folder === byName("The Broken Anvil")._id).map(f => f.name).sort(), ["Level 1 - The Apprentices", "Level 5 - The Journeymen", "Level 9 - The Veterans"]);
assert.equal(pa.filter(a => a.folder === byName("Jacob's Well")._id).length, 4);
const wen = pa.find(a => a.name.includes("Big Wen"));
assert.deepEqual([wen.type, wen.system.attributes.hp.max, wen.prototypeToken.actorLink], ["character", 12, true]);
assert.ok(["Fighter", "Human", "The Heavy Hand (Fighter)", "Greatsword", "Critical Strike"].every(n => wen.items.some(i => i.name === n)), "class, ancestry, kit, weapon and feat come from the compendiums");
assert.ok(wen.items.some(i => i.flags?.arneyan?.grantedBy && i.type === "ability"), "class features are granted like on the sheet");
}
{
// Ancestry setup data: Tiefling bloodlines (with their resistance), Genasi castes (with their attributes), Human's two +1s.
const adir = new URL("../packs-src/ancestries/", import.meta.url).pathname;
const anc = n => fs.readdirSync(adir).map(f => JSON.parse(fs.readFileSync(adir + f))).find(d => d.name === n);
const tf = anc("Tiefling").system;
assert.deepEqual([tf.choice.label, tf.choice.options.length, tf.choice.options[0].rules[0].value, tf.family, tf.bonuses.cha], ["Bloodline", 4, "fire 5", true, 2]);
const gn = anc("Genasi").system.choice;
assert.deepEqual([gn.label, gn.options[0].name, gn.options[0].bonuses], ["Caste", "Fire", { con: 2, cha: 1, wis: -1 }]);
assert.equal(anc("Human").system.pickTwo, true);
assert.ok(anc("Elf").system.choice.options.some(o => o.name.startsWith("Saevren") && o.rules.some(r => r.key === "speed" && r.value === "5")));
assert.ok(anc("Dwarf").system.rules.some(r => r.key === "resist" && r.value === "poison 5"), "approved ancestry traits apply");
const pdir2 = new URL("../packs-src/pregens/", import.meta.url).pathname;
const pat = fs.readdirSync(pdir2).map(f => JSON.parse(fs.readFileSync(pdir2 + f))).find(d => d.name === "Patience Ashcombe");
assert.ok(pat.items.some(i => i.name === "Tiefling (Infernal)") && pat.items.some(i => i.name.startsWith("Bloodline: Infernal") && i.system.rules[0].value === "fire 5"));
}
{
// QoL: how hurt a monster looks, identical monsters sharing one initiative roll, Method V's threshold.
const { healthWord, rollMonsterInitiative } = await import("../arneyan/module/qol.mjs");
assert.deepEqual([[20, 20], [15, 20], [8, 20], [3, 20], [0, 20]].map(([v, m]) => healthWord({ value: v, max: m })), ["Unhurt", "Hurt", "Bloodied", "Near death", "Down"]);
{
  // T49 (20 Oct): the GM sees HP and AC with the players' word under them; a player sees only the word.
  const { healthLabel } = await import("../arneyan/module/qol.mjs");
  const keep = { user: globalThis.game.user, settings: globalThis.game.settings };
  globalThis.game.settings = { get: () => true };
  const tok = { hover: true, document: { hidden: false }, actor: { type: "npc", isOwner: false, system: { acTotal: 40, attributes: { hp: { value: 1, max: 3 } } } } };
  globalThis.game.user = { isGM: true };
  assert.equal(healthLabel(tok), "HP 1/3 · AC 40\nBloodied");
  globalThis.game.user = { isGM: false };
  assert.equal(healthLabel(tok), "Bloodied");
  Object.assign(globalThis.game, keep);
}
globalThis.CONST.DICE_ROLL_MODES ??= { PRIVATE: "gmroll" };
globalThis.game.settings = { get: (s, k) => k === "groupInitiative" ? true : "publicroll" };
const cbs = [["g1", "A", "Goblin"], ["g2", "A", "Goblin"], ["g3", "A", "Goblin"], ["o1", "B", "Ogre"], ["pc", "C", "Wen"]].map(([id, actorId, name]) => ({ id, actorId, name, token: { name }, initiative: null, actor: { type: name === "Wen" ? "character" : "npc" } }));
const combat = { combatants: Object.assign(cbs, { get: id => cbs.find(c => c.id === id) }),
  rolled: null, rollInitiative: async ids => { combat.rolled = ids; ids.forEach((id, i) => { combat.combatants.get(id).initiative = 10 + i; }); },
  updateEmbeddedDocuments: async (t, ups) => ups.forEach(u => { combat.combatants.get(u._id).initiative = u.initiative; }) };
await rollMonsterInitiative(combat);
assert.deepEqual(combat.rolled, ["g1", "o1"], "one roll per kind of monster, none for the PC");
assert.deepEqual(cbs.map(c => c.initiative), [10, 10, 10, 11, null]);
const { meetsThreshold } = await import("../arneyan/module/chargen.mjs");
assert.deepEqual([meetsThreshold([17, 15, 14, 12, 11, 9]), meetsThreshold([15, 13, 11, 10, 10, 7])], [true, false]);
}
{
// QoL: reach and range, distance in squares, damage cards that go to the hits.
const { rangeOf, feetBetween, spellRange } = await import("../arneyan/module/qol.mjs");
assert.deepEqual(rangeOf({ system: { traits: "", range: "" } }), { reach: 5, normal: 0, long: 0 });
assert.deepEqual(rangeOf({ system: { traits: "Reach, Heavy", range: "" } }).reach, 10);
assert.deepEqual(rangeOf({ system: { ranged: true, range: "60–200 ft" } }), { reach: 0, normal: 60, long: 200 });
assert.deepEqual(rangeOf({ system: { traits: "Thrown", range: "20 ft" } }), { reach: 5, normal: 20, long: 40 });
const scene = { grid: { size: 100, distance: 5 } };
assert.equal(feetBetween({ x: 0, y: 0, width: 1, height: 1, parent: scene }, { x: 300, y: 100, width: 1, height: 1, parent: scene }), 15);
assert.deepEqual([spellRange({ system: { range: "Range 150ft" } }), spellRange({ system: { range: "Touch" } }), spellRange({ system: { range: "Self" } })], [150, 5, null]);
const hitCard = render("templates/chat/damage-card.hbs", { title: "Longsword: Damage", total: 9, formula: "1d8+3", diceGroups: [], parts: [], split: [], offers: [], notes: [],
  hits: [{ name: "Goblin", uuid: "a" }], hasHits: true, hitNames: "Goblin", missNames: "Orc", bySaves: false });
assert.ok(render("templates/chat/damage-card.hbs", { title: "Longsword: Damage", total: 9, formula: "1d8+3", diceGroups: [], parts: [], split: [], offers: [], notes: [],
  hits: [], hasHits: true, hitNames: "", missNames: "Orc" }).includes("The attack hit nobody"), "an all-miss card says so (an empty list is still a list)");
assert.ok(hitCard.includes("Goes to the ones hit") && hitCard.includes("Goblin") && hitCard.includes("missed: Orc"));
assert.ok(render("templates/chat/damage-card.hbs", { title: "Fireball", total: 30, formula: "9d6", diceGroups: [], parts: [], split: [], offers: [], notes: [], bySaves: true }).includes("arn-apply-saves"));
}
{
// Numbered conditions: Burning stacks, timers keep the longer and tick down, a venom's stage climbs.
const C = await import("../arneyan/module/counters.mjs");
let nid = 0;
const mkActor = () => {
  const effects = [];
  const a = { isOwner: true, name: "Gob",
    effects: Object.assign(effects, { contents: effects, has: id => effects.some(e => e.id === id) }),
    async toggleStatusEffect(id) { effects.push(mkEffect(id)); },
    async deleteEmbeddedDocuments(_, ids) { for (const id of ids) { const i = effects.findIndex(e => e.id === id); if (i >= 0) effects.splice(i, 1); } },
    async createEmbeddedDocuments(_, list) { for (const d of list) effects.push(mkEffect(d.statuses[0])); } };
  const mkEffect = id => ({ id: `e${++nid}`, name: id, isOwner: true, statuses: new Set([id]), flags: {},
    async update(ch) { for (const [k, v] of Object.entries(ch)) foundry.utils.setProperty(this, k, v); },
    async delete() { await a.deleteEmbeddedDocuments("ActiveEffect", [this.id]); } });
  return a;
};
globalThis.CONFIG = globalThis.CONFIG ?? {};
globalThis.ChatMessage = globalThis.ChatMessage ?? { create: () => null, getSpeaker: () => ({}) };
game.users = game.users ?? Object.assign([], { filter: () => [] });
const a = mkActor();
await C.adjustCondition(a, "burning", 1);
assert.equal(C.conditionValue(a, "burning"), 1);
await C.adjustCondition(a, "burning", 1);
assert.equal(C.turnDamageFor(a, "burning").formula, "2d6", "Burning 2 deals 2d6");
await C.reapply(a, "burning", 1);
assert.equal(C.conditionValue(a, "burning"), 3, "set alight again: another stack");
await C.adjustCondition(a, "slowed", 1); await C.adjustCondition(a, "slowed", 1);
assert.equal(C.conditionValue(a, "slowed"), 1, "first click puts it on (no timer), the next makes it 1 round");
await C.adjustCondition(a, "slowed", 1);
await C.reapply(a, "slowed", 1);
assert.equal(C.conditionValue(a, "slowed"), 2, "re-applied timer keeps the longer");
await C.reapply(a, "slowed", 3);
assert.equal(C.conditionValue(a, "slowed"), 3);
await C.tickCounters(a); await C.tickCounters(a);
assert.equal(C.conditionValue(a, "slowed"), 1);
await C.tickCounters(a);
assert.ok(!a.effects.some(e => e.statuses.has("slowed")), "ends at 0");
assert.equal(C.conditionValue(a, "burning"), 3, "Burning doesn't tick down");
await C.adjustCondition(a, "burning", -1); await C.adjustCondition(a, "burning", -1);
await C.adjustCondition(a, "burning", -1);
assert.ok(!a.effects.some(e => e.statuses.has("burning")), "right-clicking to 0 removes it");
await C.adjustCondition(a, "poisoned", 1);
assert.equal(C.turnDamageFor(a, "poisoned"), null, "first click: plain Poisoned");
await C.adjustCondition(a, "poisoned", 1);
assert.equal(C.turnDamageFor(a, "poisoned").formula, "1d4", "second click: a venom, stage 1");
await C.advancePoison(a); await C.advancePoison(a); await C.advancePoison(a); await C.advancePoison(a);
assert.equal(C.turnDamageFor(a, "poisoned").formula, "1d10", "venom climbs to 1d10 and stays");
const b = mkActor();
await C.adjustCondition(b, "poisoned", 1); await C.adjustCondition(b, "poisoned", 1); await C.adjustCondition(b, "poisoned", -1); await C.adjustCondition(b, "poisoned", -1);
assert.ok(!b.effects.length);
await b.toggleStatusEffect("poisoned");
assert.equal(C.turnDamageFor(b, "poisoned"), null, "plain Poisoned/Sickened deals no damage");
await C.adjustCondition(b, "prone", 1); await C.adjustCondition(b, "prone", 1);
assert.equal(C.conditionValue(b, "prone"), 0, "Prone has no number");
}
console.log("All checks passed.");
// Light sources: burn timers (test/lights.mjs runs on its own too).
await import("./lights.mjs");
// 0.10.1 review fixes (test/review-0101.mjs runs on its own too).
await import("./review-0101.mjs");
// 0.10.2 review fixes (test/review-0102.mjs runs on its own too).
await import("./review-0102.mjs");
// 0.10.4 Method V and Starting Scores (test/chargen.mjs runs on its own too).
await import("./chargen.mjs");
// Foundry v14 effect durations (test/v14dur.mjs runs on its own too).
await import("./v14dur.mjs");
// 0.10.19 Class details and the Browser's template (test/classinfo.mjs runs on its own too).
await import("./classinfo.mjs");
// 0.10.27 Monster art from art packs (test/art.mjs runs on its own too).
await import("./art.mjs");
// 0.10.28 The books v0.10.0 mirrored (test/books0100.mjs runs on its own too).
await import("./books0100.mjs");
// 0.10.39 The books v0.10.4 mirrored.
await import("./books0104.mjs");
await import("./realtime.mjs");
// 0.10.30 Import a character or NPC from a chat (test/import.mjs runs on its own too).
await import("./import.mjs");
// 0.10.31 The Arneyan calendar (test/calendar.mjs runs on its own too).
await import("./calendar.mjs");
// 0.10.32 The calendar kept in step with Kanka (test/kanka.mjs runs on its own too).
await import("./kanka.mjs");

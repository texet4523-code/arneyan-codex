// Content gaps and optional modules (branch "content"): class-only spells, Witch and Artificer kits, the pregens
// that use them, Dice So Nice tagging, Item Piles config, the Token Action HUD adapter, and the release files.
// Run after a build (python3 build/build.py && node build/pack.mjs).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeItem, makeActor } from "./harness.mjs";

globalThis.Roll = { replaceFormulaData: (f, d) => f.replace(/@([\w.]+)/g, (_, p) => String(p.split(".").reduce((o, k) => o?.[k], d) ?? 0)) };
const root = new URL("../", import.meta.url).pathname;
const { ARNEYAN } = await import("../arneyan/module/config.mjs");
const IM = await import("../arneyan/module/data/item-models.mjs");
const { CharacterData, NpcData } = await import("../arneyan/module/data/actor-models.mjs");
const { resolveFormula } = await import("../arneyan/module/rolls.mjs");
const { tagDamage, DICE_LOOKS } = await import("../arneyan/module/dsn.mjs");
const { priceInGp, itemPilesConfig, COIN_RATES } = await import("../arneyan/module/itempiles.mjs");
const { arneyanHudActions, tahDefaults, TAH_GROUPS } = await import("../arneyan/module/tah.mjs");

const pack = name => {
  const dir = path.join(root, "packs-src", name);
  return fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(path.join(dir, f))));
};

// ---- 1. Class-only spells: one folder per class, the book's fields, no duplicates.
const spells = pack("spells");
const folders = Object.fromEntries(spells.filter(d => d._key.startsWith("!folders!")).map(d => [d._id, d.name]));
const sp = spells.filter(d => d.type === "spell");
const names = sp.map(d => d.name.toLowerCase());
assert.equal(new Set(names).size, names.length, "a spell name appears twice in the Spells compendium");
const byName = Object.fromEntries(sp.map(d => [d.name, d]));
const inFolder = f => sp.filter(d => folders[d.folder] === f).map(d => d.name);
for (const f of ["Witch", "Necromancer", "Warlock"]) assert.ok(inFolder(f).length, `no ${f} folder of spells`);
for (const n of ["Ill Omen", "Hex of Stumbling", "Bind Wound", "Evil Eye", "Contagion", "Withering Glance", "Wither Limb", "Withering Curse"]) {
  assert.ok(byName[n], `Witch spell ${n} missing`);
  assert.ok(byName[n].system.classes.includes("Witch"), `${n} not on the Witch list`);
}
for (const n of ["Disrupt Undead", "Touch of Fatigue", "Cause Fear", "Inflict Light Wounds", "Ghoul Touch", "Halt Undead", "Enervation", "Fear (Mass)", "Harm", "Horrid Wilting", "Vile Blight", "Create Greater Undead"]) {
  assert.ok(byName[n]?.system.classes.includes("Necromancer"), `Necromancer spell ${n} missing`);
}
for (const n of ["Eldritch Blast", "Enslave", "Slay Living"]) assert.ok(byName[n]?.system.classes.includes("Warlock"), `Warlock spell ${n} missing`);
assert.deepEqual(byName.Contagion.system.classes, ["Witch", "Necromancer"]);
assert.ok(byName["Cause Fear"].system.classes.includes("Warlock"), "Cause Fear is the Abyssal Path's 1st-level spell too");
const s = n => byName[n].system;
assert.equal(s("Hex of Stumbling").level, 1); assert.equal(s("Hex of Stumbling").save, "ref"); assert.equal(s("Hex of Stumbling").saveEffect, "Negates");
assert.equal(s("Hex of Stumbling").range, "Range 30ft");
assert.equal(s("Bind Wound").damage, "2d8 + min(@cl, 10)"); assert.equal(s("Bind Wound").damageType, "healing"); assert.equal(s("Bind Wound").range, "Touch");
assert.equal(s("Inflict Light Wounds").damage, "1d8 + min(@cl, 5)"); assert.equal(s("Inflict Light Wounds").damageType, "necrotic"); assert.equal(s("Inflict Light Wounds").saveEffect, "Half");
assert.equal(s("Horrid Wilting").damage, "(min(@cl, 20))d6"); assert.equal(s("Horrid Wilting").template.type, "circle"); assert.equal(s("Horrid Wilting").template.size, 30);
assert.equal(s("Vile Blight").template.type, "cone"); assert.equal(s("Vile Blight").save, "fort"); assert.equal(s("Vile Blight").saveEffect, "Half");
assert.equal(s("Fear (Mass)").template.type, "cone"); assert.equal(s("Fear (Mass)").template.lingering, false, "Fear (Mass) lasts on the creatures, not the area");
assert.equal(s("Ill Omen").level, 0); assert.equal(s("Withering Curse").level, 8); assert.equal(s("Slay Living").level, 6); assert.equal(s("Enslave").level, 5);
assert.equal(s("Create Greater Undead").costly, true);
assert.equal(s("Disrupt Undead").damage, "1d6");

// Eldritch Blast: 1d6 at 1st, 1d8 at 5th, 2d6 at 9th, 2d8 at 13th, 3d6 at 17th, 3d8 at 24th.
const eb = s("Eldritch Blast");
assert.equal(eb.save, "ref"); assert.equal(eb.damageType, "force"); assert.equal(eb.level, 0);
const tidy = f => f.replace(/\s*\+?\s*0d\d+/g, "").replace(/^\s*\+\s*/, "").replace(/\s+/g, "").trim();
const want = { 1: "1d6", 4: "1d6", 5: "1d8", 8: "1d8", 9: "2d6", 12: "2d6", 13: "2d8", 16: "2d8", 17: "3d6", 20: "3d6", 21: "3d6", 23: "3d6", 24: "3d8" };
for (const [cl, w] of Object.entries(want)) assert.equal(tidy(resolveFormula(eb.damage, { cl: Number(cl) })), w, `Eldritch Blast at ${cl}`);

// ---- 2. Witch Patrons and Artificer Kits.
const kits = pack("kits").filter(d => d.type === "kit");
const witch = kits.filter(k => k.system.className === "Witch");
const art = kits.filter(k => k.system.className === "Artificer");
assert.equal(witch.length, 8, "eight Witch Patrons");
assert.equal(art.length, 4, "four Artificer Kits");
for (const k of witch) {
  assert.match(k.name, /^Patron: .+ \(Witch\)$/);
  assert.deepEqual(k.system.features.map(f => [f.name, f.level]), [["Patron Buff", 1], ["Patron Curse", 6], ["Physical Change", 12]], k.name);
  for (const f of k.system.features) assert.ok(f.description.length > 20, `${k.name}: ${f.name} has no text`);
}
for (const k of art) {
  assert.deepEqual(k.system.features.map(f => f.level), [1, 3, 7, 11, 15, 24], k.name);
  assert.ok(k.system.features[4].name.startsWith("Lasting Work: "), k.name);
  assert.ok(k.system.features[5].name.startsWith("Magnum Opus: "), k.name);
  assert.match(k.system.description, /<h3>Known /, `${k.name}: its Workshop list`);
}
assert.ok(art.find(k => k.name === "Alchemist (Artificer)").system.features.some(f => f.name === "Brew Formula"));
assert.ok(art.find(k => k.name === "Infuser (Artificer)").system.features.some(f => f.name === "Infuse Item" && f.level === 1));
const loretta = witch.find(k => k.name === "Patron: Mother Loretta (Witch)");
assert.ok(loretta, "Mother Loretta");
for (const k of [...witch, ...art]) assert.ok(folders && k.folder, `${k.name} has no folder`);
// No em dashes in names we made.
for (const d of [...witch, ...art, ...sp]) for (const f of d.system.features ?? []) assert.ok(!f.name.includes("—"), `em dash in ${f.name}`);

// ---- 3. The pregens find them.
const pregens = pack("pregens").filter(d => d.type === "character");
const maud = pregens.find(p => p.name === "Maud Hollins");
const tibbet = pregens.find(p => p.name === "Tibbet Quickfuse");
assert.ok(maud.items.some(i => i.type === "kit" && i.name === "Patron: Mother Loretta (Witch)"), "Maud's patron");
assert.ok(maud.items.some(i => i.type === "ability" && i.name === "Patron Buff"), "Maud's Patron Buff (1st)");
assert.ok(!maud.items.some(i => i.name === "Patron Curse"), "Maud is 5th level: no 6th-level Curse yet");
for (const n of ["Hex of Stumbling", "Bind Wound"]) assert.ok(maud.items.some(i => i.type === "spell" && i.name === n && i.system.prepared), `Maud's ${n}`);
assert.ok(tibbet.items.some(i => i.type === "kit" && i.name === "Alchemist (Artificer)"), "Tibbet's kit");
assert.deepEqual(tibbet.items.filter(i => i.flags?.arneyan?.grantedBy && i.system.className === "Alchemist (Artificer)").map(i => i.name), ["Brew Formula", "Efficient Brewing"]);

// ---- 4. Dice So Nice: damage dice carry their type as flavour, without touching a flavour already set.
const fakeRoll = () => ({ dice: [{ options: {} }, { options: { flavor: "fire" } }] });
const r1 = tagDamage(fakeRoll(), "slashing");
assert.equal(r1.dice[0].options.flavor, "slashing"); assert.equal(r1.dice[1].options.flavor, "fire");
assert.equal(tagDamage(fakeRoll(), "").dice[0].options.flavor, undefined);
assert.equal(tagDamage(fakeRoll(), "nonsense").dice[0].options.flavor, undefined);
assert.equal(tagDamage(null, "fire"), null);
for (const t of Object.keys(DICE_LOOKS)) assert.ok(t in ARNEYAN.damageTypes, `${t} is a damage type`);
for (const t of ["slashing", "piercing", "bludgeoning", "healing"]) assert.ok(DICE_LOOKS[t], `a look for ${t}`);

// ---- 5. Item Piles.
assert.equal(priceInGp("4,500 gp"), 4500);
assert.equal(priceInGp("5 sp"), 0.5);
assert.equal(priceInGp("6 cp"), 0.06);
assert.equal(priceInGp("2 pp"), 20);
assert.equal(priceInGp("6 sp Hand Keg – 56 gp Tun"), 0.6);
assert.equal(priceInGp("special order only, 150 gp"), 150);
assert.equal(priceInGp("15"), 15); assert.equal(priceInGp("1,200"), 1200);
assert.equal(priceInGp("—"), 0); assert.equal(priceInGp(""), 0); assert.equal(priceInGp(undefined), 0); assert.equal(priceInGp(12), 12);
const ip = itemPilesConfig();
// The checks Item Piles' addSystemIntegration makes.
for (const k of ["VERSION", "ACTOR_CLASS_TYPE", "ITEM_QUANTITY_ATTRIBUTE", "ITEM_PRICE_ATTRIBUTE"]) assert.equal(typeof ip[k], "string", k);
assert.ok(Array.isArray(ip.ITEM_FILTERS) && ip.ITEM_FILTERS.every(f => typeof f.path === "string" && typeof f.filters === "string"));
assert.equal(typeof ip.ITEM_TRANSFORMER({}), "object");
assert.equal(typeof ip.PILE_DEFAULTS, "object");
assert.ok(ip.ITEM_SIMILARITIES.every(p => typeof p === "string"));
assert.equal(ip.CURRENCIES.filter(c => c.primary).length, 1);
for (const c of ip.CURRENCIES) {
  assert.equal(typeof c.primary, "boolean"); assert.equal(typeof c.name, "string"); assert.equal(typeof c.abbreviation, "string");
  assert.equal(typeof c.exchangeRate, "number"); assert.equal(typeof c.data.path, "string");
  assert.ok(fs.existsSync(path.join(root, "arneyan", c.img.replace("systems/arneyan/", ""))), `coin icon ${c.img}`);
}
assert.equal(typeof ip.CURRENCY_DECIMAL_DIGITS, "number");
// The paths exist on our data models.
const pc0 = makeActor(CharacterData, "character", { currency: { pp: 1, gp: 2, sp: 3, cp: 4 } });
for (const c of ip.CURRENCIES) assert.equal(typeof foundry.utils.getProperty(pc0, c.data.path), "number", c.data.path);
assert.deepEqual(Object.keys(COIN_RATES).sort(), Object.keys(pc0.system.currency).sort());
const sword = makeItem(IM.WeaponData, "weapon", "Sword, Long", { price: "15 gp", quantity: 2, equipped: true, inside: "abc" });
assert.equal(foundry.utils.getProperty(sword, ip.ITEM_QUANTITY_ATTRIBUTE), 2);
assert.equal(ip.ITEM_COST_TRANSFORMER(sword), 15);
const moved = ip.ITEM_TRANSFORMER({ system: { equipped: true, inside: "abc", quantity: 1 } });
assert.equal(moved.system.equipped, false); assert.equal(moved.system.inside, "");
for (const t of ip.ITEM_FILTERS[0].filters.split(",")) assert.ok(t in IM ? true : ["class", "ancestry", "kit", "feat", "skill", "ability", "spell"].includes(t));

// ---- 6. Token Action HUD.
const wizard = makeItem(IM.ClassData, "class", "Witch", { levels: 3, bthProgression: "arcane", keyAbility: "wis", castingAbility: "wis",
  slotTable: Array.from({ length: 24 }, () => [2, 2, 1, 0, 0, 0, 0, 0, 0, 0]) });
const staff = makeItem(IM.WeaponData, "weapon", "Staff", { damage: "1d6", equipped: true });
const dagger = makeItem(IM.WeaponData, "weapon", "Dagger", { damage: "1d4", equipped: false });
const hexS = makeItem(IM.SpellData, "spell", "Hex of Stumbling", { level: 1, className: "Witch", prepared: true, save: "ref" });
const omen = makeItem(IM.SpellData, "spell", "Ill Omen", { level: 0, className: "Witch" });
const bindW = makeItem(IM.SpellData, "spell", "Bind Wound", { level: 2, className: "Witch", prepared: false });
const buff = makeItem(IM.AbilityData, "ability", "Patron Buff", { uses: { value: 1, max: 1, per: "day" } });
const vigour = makeItem(IM.AbilityData, "ability", "Hag's Vigour", {});
const trip = makeItem(IM.AbilityData, "ability", "Trip", { kind: "action" });
const herb = makeItem(IM.SkillData, "skill", "Herbalism", { tier: "master" });
const witchPc = makeActor(CharacterData, "character", { abilities: { wis: { value: 16 }, dex: { value: 12 } } }, [wizard, staff, dagger, hexS, omen, bindW, buff, vigour, trip, herb]);
witchPc.statuses = new Set(["prone"]);
const status = Object.entries(ARNEYAN.conditions).map(([id, c]) => ({ id, name: c.name, img: `systems/arneyan/assets/conditions/${id}.svg` }));
const hud = arneyanHudActions(witchPc, { statusEffects: status, manoeuvres: [{ uuid: "Compendium.arneyan.actions.Item.x1", name: "Trip", img: "" }, { uuid: "Compendium.arneyan.actions.Item.x2", name: "Disarm", img: "" }] });
const ids = Object.values(hud).flat().map(a => a.id);
assert.equal(new Set(ids).size, ids.length, "HUD action ids are unique");
for (const g of Object.keys(hud)) assert.ok(g in TAH_GROUPS, `unknown group ${g}`);
assert.deepEqual(hud.attacks.map(a => a.name), ["Staff"], "only the weapon in hand when one is");
assert.deepEqual(hud.cantrips.map(a => a.name), ["Ill Omen"]);
assert.deepEqual(hud["spells-1"].map(a => a.name), ["Hex of Stumbling"]);
assert.equal(hud["spells-2"].length, 0, "unprepared spells stay off the HUD");
assert.deepEqual(hud.abilities.map(a => a.name), ["Patron Buff"], "passive features stay off the HUD");
assert.equal(hud.abilities[0].info1.text, "1/1");
assert.deepEqual(hud.manoeuvres.map(a => a.name), ["Trip", "Disarm"], "own manoeuvres, then the compendium's others");
assert.equal(hud.manoeuvres[1].system.actionType, "manoeuvre");
assert.deepEqual(hud.saves.map(a => a.system.actionId), ["fort", "ref", "will"]);
assert.equal(hud.saves[2].info1.text, `+${witchPc.system.saves.will.value}`);
assert.equal(hud.checks.find(a => a.system.actionId === "wis").info1.text, "+2");
assert.deepEqual(hud.skills.map(a => [a.name, a.info1.text]), [["Herbalism", "Master"]]);
assert.equal(hud.conditions.length, Object.keys(ARNEYAN.conditions).length);
assert.ok(hud.conditions.find(a => a.system.actionId === "prone").cssClass.includes("active"));
assert.ok(!hud.conditions.find(a => a.system.actionId === "blinded").cssClass.includes("active"));
assert.deepEqual(hud.utility.map(a => a.system.actionId), ["luck", "rest"]);
assert.ok(Object.values(hud).flat().every(a => a.name && a.listName && a.system?.actionType && !("prefix" in a)));
// Several tokens: saves, checks, conditions and initiative only.
const multi = arneyanHudActions(null, { statusEffects: status });
assert.equal(multi.saves.length, 3); assert.equal(multi.attacks.length, 0); assert.equal(multi.combat.length, 1);
// A monster: every weapon, its saves from the stat block.
const ogre = makeActor(NpcData, "npc", { level: 4, attributes: { ac: 15, attack: 5 }, saves: { fort: 6, ref: 1, will: 2 } }, [makeItem(IM.WeaponData, "weapon", "Club", { damage: "2d6" })]);
const oh = arneyanHudActions(ogre, { statusEffects: status });
assert.deepEqual(oh.attacks.map(a => a.name), ["Club"]); assert.equal(oh.saves[0].info1.text, "+6"); assert.equal(oh.utility.length, 0);
// Layout: every group in it is a declared group.
const def = tahDefaults();
const declared = new Set(def.groups.map(g => g.id));
for (const cat of def.layout) for (const g of cat.groups) { assert.ok(declared.has(g.id), g.id); assert.equal(g.nestId, `${cat.id}_${g.id}`); }
assert.ok(declared.has("token"), "core's token group (combat toggle, visibility)");

// ---- 7. Registered from arneyan.mjs, guarded by each module's own hook; the release files.
const main = fs.readFileSync(path.join(root, "arneyan/module/arneyan.mjs"), "utf8");
assert.match(main, /import \{ registerIntegrations \} from "\.\/integrations\.mjs";/);
assert.match(main, /registerIntegrations\(\);/);
const integ = ["dsn.mjs", "itempiles.mjs", "tah.mjs"].map(f => fs.readFileSync(path.join(root, "arneyan/module", f), "utf8")).join("\n");
for (const h of ["diceSoNiceReady", "item-piles-ready", "tokenActionHudCoreApiReady"]) assert.ok(integ.includes(`"${h}"`), h);
const wf = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");
for (const w of ["release:", "arneyan.zip", "system.json", "gh release upload", "node build/pack.mjs"]) assert.ok(wf.includes(w), `workflow: ${w}`);
assert.ok(fs.existsSync(path.join(root, "RELEASING.md")));
// Player-facing text from these files: no em dashes.
for (const f of ["dsn.mjs", "itempiles.mjs", "tah.mjs", "integrations.mjs"]) assert.ok(!fs.readFileSync(path.join(root, "arneyan/module", f), "utf8").includes("—"), `em dash in ${f}`);

console.log("OK content");

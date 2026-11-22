// 0.10.43: Wild Shape picks a beast (or a beast-like monster) up to the Level cap; Change Shape can pick any creature.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
globalThis.game ??= {};
game.time = { worldTime: 1000 };
const T = await import("../arneyan/module/transform.mjs");
const mdir = new URL("../packs-src/monsters/", import.meta.url).pathname;
const monsters = fs.readdirSync(mdir).map(f => JSON.parse(fs.readFileSync(mdir + f))).filter(d => d.type === "npc");

// The cap (HB v0.10.86): two-thirds of the Druid level, rounded down, at least 1, at most 10; a Shapeshifter has no
// Level 10 cap.
assert.deepEqual([1, 2, 3, 5, 11, 12, 15, 16, 20].map(l => T.wildShapeCap(l)), [1, 1, 2, 3, 7, 8, 10, 10, 10]);
assert.deepEqual([16, 20].map(l => T.wildShapeCap(l, true)), [10, 13]);
assert.deepEqual([[1, false], [9, false], [4, true], [5, true], [8, true], [9, true]].map(([l, s]) => T.wildCastingMax(l, s)), [0, 0, 0, 2, 2, 4], "no spells in Wild Shape but the Shapeshifter's");
// When a form of each Level opens: an Owlbear (Level 7) at Druid 11; a Level 3 beast at 5.
assert.deepEqual([0, 1, 2, 3, 5, 6, 7, 13].map(T.druidLevelFor), [1, 1, 3, 5, 8, 9, 11, 20]);
for (let d = 1; d <= 25; d++) for (let lvl = 0; lvl <= 25; lvl++) {
  const can = lvl <= T.wildShapeCap(d, true);
  assert.equal(can, d >= T.druidLevelFor(lvl), `Druid ${d}, Level ${lvl}`);
}

// Which creatures: every beast, and the beast-like monsters on the list (each in the Bestiary, none a beast already).
const wild = monsters.filter(m => T.isWildForm(m));
assert.ok(wild.some(m => m.name === "Owlbear") && wild.some(m => m.name === "Wolf") && wild.some(m => m.name === "Dire Wolf"));
for (const n of T.BEAST_LIKE) {
  const m = monsters.find(x => x.name === n);
  assert.ok(m, `${n} is in the Bestiary`);
  assert.ok(!String(m.system.details.type).startsWith("beast"), `${n} is beast-like, not a beast`);
}
for (const n of ["Worg", "Winter Wolf", "Displacer Beast", "Manticore", "Basilisk", "Phase Spider", "Goblin", "Treant"]) assert.ok(!wild.some(m => m.name === n), `${n} isn't a Wild Shape form`);
// Never a solo (M3, 0.10.49): the Roc and the Purple Worm are off, and any solo beast is refused.
for (const n of ["Roc", "Purple Worm", "Remorhaz"]) assert.ok(!wild.some(m => m.name === n), `${n} (a solo) isn't a Wild Shape form`);
assert.ok(monsters.filter(m => m.system.details.isSolo).every(m => !T.isWildForm(m)), "no solo is a form");
assert.equal(T.isWildForm({ name: "Wolf", system: { details: { type: "beast", isSolo: true } } }), false);
// HB v0.10.86: the beast-like monsters are the Shapeshifter's Beast Shape only.
assert.equal(T.isWildForm(monsters.find(m => m.name === "Owlbear"), { beastLike: false }), false);
assert.equal(T.isWildForm(monsters.find(m => m.name === "Wolf"), { beastLike: false }), true);
for (const n of ["Wyvern", "Grey Render", "Gorgon", "Umber Hulk", "Behir", "Chimera"]) assert.ok(T.BEAST_LIKE.includes(n), n);

// Wild Shape's form: an hour-long Wild Shape effect, and Deepened Shape's temporary HP.
const src = { name: "Ilsa", type: "character", img: "i.png", system: { abilities: { int: { value: 12 }, wis: { value: 17 }, cha: { value: 9 } } }, items: [], effects: [], ownership: {}, prototypeToken: {}, flags: {} };
const druid = { name: "Ilsa", uuid: "Actor.d", toObject: () => JSON.parse(JSON.stringify(src)), effects: { contents: [] }, system: { ...src.system, attributes: { hp: { value: 30 } } } };
const owlDoc = monsters.find(m => m.name === "Owlbear");
const owl = { ...owlDoc, uuid: "Compendium.arneyan.monsters.Actor.o", toObject: () => JSON.parse(JSON.stringify(owlDoc)) };
let fd = T.formData(druid, owl, { keepMind: true, wildShape: true, tempHp: 24 });
const eff = fd.effects.find(e => e.name === "Wild Shape");
assert.ok(eff && eff.flags.arneyan.wildShape && eff.flags.arneyan.endsAt === 1000 + 3600);
assert.equal(fd.system.attributes.hp.temp, 24);
assert.equal(fd.flags.arneyan.transform.wildShape, true);
fd = T.formData(druid, owl, { keepMind: true });
assert.ok(!fd.effects.some(e => e.name === "Wild Shape"), "a plain change of shape has no hour");

// The feature's Use button goes to the picker; Change Shape has the whole Bestiary.
const docs = fs.readFileSync(new URL("../arneyan/module/documents.mjs", import.meta.url), "utf8");
assert.ok(docs.includes('this.name === "Wild Shape"') && docs.includes("wildShape(this, event)"));
const tr = fs.readFileSync(new URL("../arneyan/module/transform.mjs", import.meta.url), "utf8");
assert.ok(tr.includes("Every creature in the Bestiary") && tr.includes("wildShape: !!wild"));
console.log("OK wild shape");
// Built into the system (players can't always see the Bestiary): the same forms, with the Bestiary's ids.
const { WILD_FORMS } = await import("../arneyan/module/wild-forms.mjs");
assert.equal(WILD_FORMS.length, wild.length);
for (const e of WILD_FORMS) assert.ok(monsters.some(m => m._id === e.id && m.name === e.name), e.name);
assert.ok(T.builtWildForms()[0].uuid.startsWith("Compendium.arneyan.monsters.Actor."));
// The GM's client works out the druid's cap itself from the sheet.
const featureOf = lvl => ({ name: "Wild Shape", featureLevel: lvl });
const druidAt = (lvl, extra = []) => ({ system: { level: lvl }, items: Object.assign([featureOf(lvl), ...extra], {}) });
assert.deepEqual((({ cap, tempHp }) => ({ cap, tempHp }))(T.wildShapeFor(druidAt(6))), { cap: 4, tempHp: 0 });
assert.deepEqual((({ cap, tempHp }) => ({ cap, tempHp }))(T.wildShapeFor(druidAt(12))), { cap: 8, tempHp: 0 });
assert.deepEqual((({ shapeshifter, deepened, casting }) => ({ shapeshifter, deepened, casting }))(T.wildShapeFor(druidAt(12))), { shapeshifter: false, deepened: false, casting: 0 });
const kitSS = { type: "kit", name: "Shapeshifter (Druid)" };
assert.deepEqual((({ shapeshifter, deepened, casting, cap }) => ({ shapeshifter, deepened, casting, cap }))(T.wildShapeFor(druidAt(18, [kitSS]))), { shapeshifter: true, deepened: true, casting: 4, cap: 12 });
assert.equal(T.wildShapeFor({ system: { level: 5 }, items: [] }), null);
assert.ok(tr.includes("wild = wildShapeFor(original)") && tr.includes("levelOf(form) > wild.cap"));
console.log("OK wild shape list and GM check");

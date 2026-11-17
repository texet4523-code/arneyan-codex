// Handbook and Monsters & Treasure v0.10.75 (B-F69, R-F33): the solo reprint. Marked Solo, Run as solo, phases in
// place of Bloodied, the nine types' villain actions, Mythic phase HP, the world update; Versatile and Parrying Stance.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
for (const k of ["Actor", "Item", "Combatant", "ChatMessage"]) globalThis[k] ??= class {};

const dir = sub => new URL(`../packs-src/${sub}/`, import.meta.url);
const read = (sub, pre) => fs.readdirSync(dir(sub)).filter(f => f.startsWith(pre)).map(f => JSON.parse(fs.readFileSync(new URL(f, dir(sub)), "utf8")));
const src = f => fs.readFileSync(new URL(`../arneyan/${f}`, import.meta.url), "utf8");
const monsters = read("monsters", "actors_");
const m = n => monsters.find(x => x.name === n);
const va = x => x.items.filter(i => i.flags?.arneyan?.villainAction);

/* The Bestiary: 105 marked Solo (75, and M&T v0.10.83's 30 new adult and ancient dragons) plus the Mythic three, each with a type (or its own actions) and three villain actions. */
const solos = monsters.filter(x => x.system.details.isSolo);
assert.equal(solos.length, 108);
const types = {};
for (const s of solos) types[s.system.details.soloType || "own"] = (types[s.system.details.soloType || "own"] ?? 0) + 1;
assert.deepEqual(types, { Dragon: 62, Fiend: 9, Undead: 6, "Eye tyrant": 4, "Mind lord": 2, Celestial: 4, "Giant or golem": 5, "Great beast": 4, Spellcaster: 6, own: 6 });
for (const s of solos) assert.deepEqual(va(s).map(i => i.flags.arneyan.villainAction), [1, 2, 3], s.name);
assert.ok(!monsters.filter(x => !x.system.details.isSolo).some(x => va(x).length), "only solos have villain actions");
assert.ok(!monsters.some(x => x.items.some(i => /^Solo:/.test(i.name))), "the Solo line is not an ability");
// M&T v0.10.76 (K163 M11): the cap in place of halving; the 45 "also halves" notes are gone.
assert.equal(monsters.filter(x => x.system.details.soloHalves).length, 0);
assert.ok(/its attacks deal no more than the Damage target for its Level in a round \(\d+\)/.test(m("Vampire").system.details.description));

/* Phase HP: the Vampire 50 (was 100); the Mythic three 600 over three phases of 200. */
assert.equal(m("Vampire").system.attributes.hp.max, 50);
for (const n of ["Tarrasque", "Tiamat", "Bahamut"]) assert.equal(m(n).system.attributes.hp.max, 200, n);

/* A type's actions worked out for the block: DC 10 + half its Level + the bracketed attribute; damage from the table. */
const [o, c, u] = va(m("Vampire"));
assert.deepEqual([o.name, c.name, u.name], ["Villain Action 1 (Opener): Grave Dread", "Villain Action 2 (Crowd Control): Grip of the Grave", "Villain Action 3 (Ultimate): Soul Rend"]);
assert.deepEqual([o.system.damage, c.system.damage, u.system.damage], ["1d10", "3d6", "5d8"], "Level 9: opener 1d10 each in an area, 3d6, 5d8");
assert.deepEqual([o.system.save, c.system.save, u.system.save], ["will", "ref", "fort"]);
assert.equal(o.system.damageType, "necrotic");
assert.deepEqual(o.system.uses, { value: 1, max: 1, per: "encounter" });
assert.ok(!/\((Str|Dex|Con|Int|Wis|Cha)\)/.test(o.system.description), "the bracket became a DC");
// "(radiant for a baelnorn)": the Baelnorn's opener and ultimate are radiant, its crowd control necrotic.
assert.deepEqual(va(m("Baelnorn")).map(i => i.system.damageType), ["radiant", "necrotic", "radiant"]);
// "(lightning for a storm giant, poison for an iron golem)".
assert.equal(va(m("Iron Golem"))[1].system.damageType, "poison");
assert.equal(va(m("Storm Giant"))[1].system.damageType, "lightning");
// A dragon: its element is its breath weapon's, with that element's save and rider.
const red = m("Red Dragon, Ancient");
const rv = va(red);
assert.equal(rv[0].system.damageType, "fire");
assert.equal(rv[1].system.save, "ref");
assert.equal(rv[1].system.damageType, "fire");
assert.ok(/pushed 15ft and Prone/.test(rv[1].system.description.replace(/<[^>]+>|@Condition\[\w+\]\{|\}/g, "")));
assert.ok(rv.every(i => !/its element/.test(i.system.description.replace(/Its element: fire/, ""))), "no unresolved element");
// A Spellcaster uses its spell DC.
const arch = va(m("Archmage"));
assert.ok(arch.every(i => !i.system.save || i.system.dc === arch[0].system.dc));
// Review fixes: "Each creature" and "Up to three" openers take the area die; Spell Storm keeps "of a type it chooses".
for (const n of ["Remorhaz", "Archmage", "Kraken"]) assert.equal(va(m(n))[0].system.damage, "2d6", n);
assert.ok(/damage of a type it chooses/.test(va(m("Archmage"))[1].system.description));
// A creature with its own villain actions uses them as written: the table adds nothing (M&T v0.10.80; fixed in 0.10.117).
for (const n of ["Ssendam, Slaad Lord", "Ygorl, Slaad Lord", "Primus", "Tarrasque"]) {
  assert.equal(va(m(n))[0].system.damage, "", n);
  assert.ok(!/Opener damage/.test(va(m(n))[0].system.description), n);
}
// Named bosses keep their own.
assert.equal(va(m("Ssendam, Slaad Lord"))[0].name, "Villain Action 1 (Opener): The Golden Madness");

/* The rules in the module: marked vs run as a solo; phases. */
const S = await import("../arneyan/module/solo.mjs");
const npc = (d, extra = {}) => ({ type: "npc", system: { details: d, attributes: { hp: { value: 50, max: 50 } } }, flags: {}, ...extra });
assert.equal(S.isSolo(npc({ isSolo: true })), false, "marked, not run: a normal creature");
assert.equal(S.isSolo(npc({ isSolo: true, runSolo: true })), true);
assert.equal(S.isSolo(npc({ isSolo: false, runSolo: true })), false, "only a marked creature");
assert.equal(S.isSolo(npc({ isSolo: true, levelText: "Mythic" })), true, "the Mythic three always");
assert.equal(S.markedSolo(npc({ isSolo: true })), true);
assert.deepEqual(S.phaseStep({ hp: -7, max: 50, phase: 1 }), { hp: 50, next: 2 }, "next phase at full HP, excess lost");
assert.deepEqual(S.phaseStep({ hp: 0, max: 50, phase: 2 }), { hp: 50, next: 3 });
assert.deepEqual(S.phaseStep({ hp: -3, max: 50, phase: 3 }), { hp: -3, next: 0 }, "dies in its third phase");
assert.deepEqual(S.phaseStep({ hp: -3, max: 50, phase: 2, changedThisRound: true }), { hp: 1, next: 0 }, "once a round: held at 1");
assert.deepEqual(S.phaseStep({ hp: -3, max: 50, phase: 3, changedThisRound: true }), { hp: 1, next: 0 }, "last phase included");
assert.deepEqual(S.phaseStep({ hp: 12, max: 50, phase: 1 }), { hp: 12, next: 0 });
assert.equal(S.phaseOf({ flags: { arneyan: { soloPhase: { n: 3 } } } }), 3);
assert.equal(S.phaseOf({ flags: {} }), 1);
// phasePreUpdate on an update's changes (outside a fight: no once-a-round key).
globalThis.foundry.utils.getProperty ??= (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
globalThis.foundry.utils.setProperty ??= (o, p, v) => { const ks = p.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k] ??= {}; x[ks.at(-1)] = v; };
const run = npc({ isSolo: true, runSolo: true }, { flags: { arneyan: { soloPhase: { n: 1, key: "" } } } });
const ch = { system: { attributes: { hp: { value: -4 } } } }, opts = {};
S.phasePreUpdate(run, ch, opts);
assert.equal(ch.system.attributes.hp.value, 50);
assert.equal(ch.flags.arneyan.soloPhase.n, 2);
const plain = npc({ isSolo: true });
const ch2 = { system: { attributes: { hp: { value: -4 } } } };
S.phasePreUpdate(plain, ch2, {});
assert.equal(ch2.system.attributes.hp.value, -4, "a normal creature just drops");
const tick = { system: { details: { runSolo: true } } };
S.phasePreUpdate(npc({ isSolo: true }, { system: { details: { isSolo: true }, attributes: { hp: { value: 9, max: 50 } } } }), tick, {});
assert.equal(tick.system.attributes.hp.value, 50, "ticking Run as solo starts it at full HP");
assert.deepEqual(tick.flags.arneyan.soloPhase, { n: 1, key: "" });
// Villain actions: no longer one a round.
assert.equal(S.villainBlock({ statuses: [] }), null);
assert.ok(/a normal creature has no villain actions/.test(src("module/solo.mjs")));
assert.ok(/phasePreUpdate\(this, changes, options\);\n\s*\/\/ Current HP never goes above/.test(src("module/documents.mjs")), "before the HP cap");
assert.ok(!/bloodied\(actor\)/.test(src("module/solo.mjs")));

/* The Encounter Builder: a marked creature costs as a solo only when run as one. */
const E = await import("../arneyan/module/encounter.mjs");
const party = [12, 12, 12, 12];
assert.equal(E.encounterBudget(party, [{ name: "Vampire", level: 12, solo: true, count: 1 }]).total, 4, "as a solo: the whole budget");
assert.equal(E.encounterBudget(party, [{ name: "Vampire", level: 12, solo: false, count: 1 }]).total, 1, "as a normal creature: 1");
assert.ok(/soloToggle/.test(src("module/encounter.mjs")) && /data-action="soloToggle"/.test(src("templates/apps/encounter.hbs")));

assert.ok(/marked: f\.marked \?\? !!f\.solo/.test(src("module/encounter.mjs")), "old lists can be toggled");
assert.ok(/phaseMarker/.test(src("module/chat.mjs")) && /soloPhase: soloRuns\(actor\) \? \(actor\.flags\?\.\[SYS\]\?\.soloPhase \?\? \{ n: 1, key: "" \}\) : null/.test(src("module/chat.mjs")), "Undo puts the phase back");
assert.ok(/A new fight starts in phase 1/.test(src("module/solo.mjs")));

/* The world update (pure part). */
const M = await import("../arneyan/module/migrate.mjs");
assert.equal(M.PHASE_REWORK, "0.10.109");
const book = { system: { details: { isSolo: true, soloType: "Undead", soloHalves: true, description: "<p>new</p>" }, attributes: { hp: { max: 50 } } },
  items: [{ _id: "n1", name: "Villain Action 1 (Opener): Grave Dread", flags: { arneyan: { villainAction: 1 } } }] };
const world = { system: { details: { isSolo: true }, attributes: { hp: { value: 100, max: 100 } } }, flags: { arneyan: { bloodied: true } },
  items: [{ id: "o1", flags: { arneyan: { villainAction: 1 } } }, { id: "w1", flags: {} }], effects: [{ id: "e1", statuses: new Set(["bloodied"]) }, { id: "e2", statuses: new Set(["prone"]) }] };
const r = M.phaseRework(world, book);
assert.equal(r.update["system.attributes.hp.max"], 50);
assert.equal(r.update["system.attributes.hp.value"], 50, "was full: full again");
assert.equal(r.update["system.details.soloType"], "Undead");
assert.deepEqual(r.drop, ["o1"]);
assert.deepEqual(r.add.map(i => i.name), ["Villain Action 1 (Opener): Grave Dread"]);
assert.equal(r.add[0]._id, undefined);
assert.deepEqual(r.marks, ["e1"]);
assert.deepEqual(M.bloodiedMarks(world), ["e1"]);
// An unlinked token already showing the new maximum (its base updated first): current HP still capped.
const tok = { isToken: true, system: { details: { isSolo: true }, attributes: { hp: { value: 80, max: 50 } } }, flags: {}, items: book.items, effects: [] };
const rt = M.phaseRework(tok, book);
assert.equal(rt.update["system.attributes.hp.value"], 50);
assert.deepEqual([rt.drop, rt.add], [[], []], "its villain actions already match: left alone");
assert.equal(rt.update["system.details.description"], undefined);
assert.equal(M.phaseRework(world, { system: { details: { isSolo: false } } }), null);
const kept = M.phaseRework({ ...world, items: [{ id: "o1", flags: { arneyan: { villainAction: 1, keepCustom: true } } }] }, book);
assert.deepEqual([kept.drop, kept.add], [[], []], "Keep my edits keeps its villain actions");

/* The phase marker replaces Bloodied. */
const C = await import("../arneyan/module/config.mjs");
assert.ok(C.ARNEYAN.conditions.phase && !C.ARNEYAN.conditions.bloodied);

/* Handbook v0.10.75. */
const spells = read("spells", "items_");
assert.ok(/against a solo, it deals only half its current HP/.test(spells.find(x => x.name === "Heal").system.description));
const cf = read("class-features", "items_");
assert.ok(cf.some(x => /current HP instead/.test(x.system.description) && x.name === "Death Attack"));
assert.ok(cf.some(x => /changes phase/.test(x.system.description) && x.name === "Open Vein"));
assert.ok(!cf.some(x => /Bloodied/.test(x.system.description)), "no Bloodied left in the class features");

/* Versatile: the die steps up one size two-handed (Codex). */
const D = await import("../arneyan/module/documents.mjs");
assert.deepEqual(["1d6", "1d8+1", "1d10", "2d4", "1d12", "d8"].map(D.versatileStep), ["1d8", "1d10+1", "1d12", "2d6", "1d12", "d10"]);
assert.ok(/Versatile's step-up is in the weapon's own dice/.test(src("module/documents.mjs")));
assert.ok(/steps up one size/.test(C.ARNEYAN.weaponTraits?.Versatile?.text ?? src("module/config.mjs")));

/* Parrying Stance: no Use button once its option has closed. */
assert.ok(/acts: acts\(i\)/.test(src("module/sheets.mjs")) && /availableActivities \?\? i\.system\.activities\)\?\.length/.test(src("module/tah.mjs")));
console.log("OK HB and M&T v0.10.75");

/* 0.10.114: a monster's Spellcasting and Innate lines link every spell they name (plain names since M&T v0.10.76). */
{
  let casters = 0;
  for (const sub of ["monsters", "kk-monsters"]) for (const f of fs.readdirSync(dir(sub)).filter(x => x.startsWith("actors_"))) {
    const d = JSON.parse(fs.readFileSync(new URL(f, dir(sub)), "utf8"));
    const lines = d.items.filter(i => ["Innate Spellcasting", "Spellcasting"].includes(i.name));
    if (!lines.length) continue;
    casters += 1;
    const text = lines.map(i => i.system.description).join(" ");
    assert.ok(!text.includes("\u0000"), `${d.name}: no placeholder left`);
    const links = new Set([...text.matchAll(/@UUID\[Compendium\.arneyan\.spells\.Item\.(\w+)\]/g)].map(m => m[1]));
    for (const s of d.items.filter(i => i.type === "spell")) {
      const id = String(s._stats?.compendiumSource ?? "").split(".").pop();
      assert.ok(links.has(id), `${d.name}: ${s.name} is linked in its spell line`);
    }
  }
  assert.ok(casters > 100, `casters checked (${casters})`);
  const ef = JSON.parse(fs.readFileSync(new URL(fs.readdirSync(dir("monsters")).find(x => x.startsWith("actors_Efreeti_")), dir("monsters")), "utf8"));
  assert.ok(!/@Condition\[burning\]\{Burning\} Hands/.test(ef.items.find(i => i.name === "Innate Spellcasting").system.description), "Burning Hands is the spell, not the condition");
  console.log("OK monster spell links");
}

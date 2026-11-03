// Books v0.10.36 and v0.10.37 (K35 to K43; board B-F23 and B-F24) in the system (0.10.79): the Advantage pass, the
// Witch's Cauldron Brews, the ancestry pass, the Westfront kits and the Star Spawn Grue's aura.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

const { levelText } = await import("../arneyan/module/effects.mjs");
const read = (dir, prefix = "items_") => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith(prefix))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const features = read("class-features"), kits = read("kits").filter(k => k.type === "kit"), anc = read("ancestries");
const feat = (n, c) => { const f = features.find(x => x.name === n && x.system.className === c); assert.ok(f, `${n} (${c})`); return f.system; };
const advFirst = rules => (rules ?? []).some(r => /^adv\.attack/.test(r.key));

/* Level tables in text can hold commas inside a step (the brews' tiers). */
assert.equal(levelText("{1:Saves of one kind (Fortitude, Reflex or Will)., 9:All three saves, and temporary HP.}", 5), "Saves of one kind (Fortitude, Reflex or Will).");
assert.equal(levelText("{1:Saves of one kind (Fortitude, Reflex or Will)., 9:All three saves, and temporary HP.}", 9), "All three saves, and temporary HP.");
assert.equal(levelText("{1:1, 5:2, 9:3}d8 + @cl", 6), "2d8 + @cl");

/* Cauldron Brews: 2 to 6 draughts a day, 14 recipes, the in-fight ones roll. */
const cb = feat("Cauldron Brews", "Witch");
assert.equal(cb.level, 1);
assert.deepEqual([cb.uses.per, cb.uses.formula], ["day", "1:2, 5:3, 9:4, 13:5, 17:6"]);
const names = [...new Set(cb.activities.map(a => a.name))];
assert.equal(names.length, 14, names.join(", "));
const act = n => cb.activities.filter(a => a.name === n);
assert.deepEqual([act("Hex Oil")[0].kind, act("Hex Oil")[0].damageType, levelText(act("Hex Oil")[0].formula, 13)], ["damage", "necrotic", "3d6"]);
assert.equal(levelText(act("Hearthfire Broth")[0].formula, 9), "3d8 + @cl");
assert.deepEqual(act("Hag's Remedy").map(a => [a.kind, a.minLevel, a.maxLevel]), [["note", 0, 8], ["heal", 9, 0]], "no 0 HP roll before 9th");
assert.ok(cb.activities.every(a => a.cost === 1), "each draught spends one");
assert.ok(features.some(f => f.system.className === "Witch" && f.name === "Cauldron Brews"));

/* The Advantage pass (K35 to K37). */
const smite = feat("Channel Divinity (Charisma)", "Paladin").activities.filter(a => a.name.startsWith("Smite"));
// Books v0.10.41 (K48): Smite improves at 13th adds a 1d8 radiant rider.
assert.deepEqual(smite.map(a => [a.kind, a.cost, a.damageType ?? ""]), [["damage", 1, "radiant"], ["heal", 0, ""], ["damage", 0, "radiant"]]);
assert.ok(/when you hit/.test(smite[0].text) && !/Advantage/.test(smite[0].text));
const cmd = feat("Command (Charisma)", "Knight");
const inspired = cmd.applies.find(a => a.name === "Inspired");
assert.ok(!advFirst(inspired.rules) && inspired.rules.some(r => r.key === "immune" && r.value === "condition:frightened"));
assert.ok(cmd.applies.find(a => a.name === "Demoralised (failed save)").rules.every(r => r.key.startsWith("note.")));
const perf = feat("Performance (Charisma)", "Bard");
assert.ok(!advFirst(perf.applies.find(a => a.name === "Exhorted").rules) && !advFirst(perf.applies.find(a => a.name === "Discord").rules));
assert.deepEqual(feat("Intimidate (Strength)", "Barbarian").applies[0].statuses, ["frightened"]);
for (const [n, c] of [["Favoured Enemy", "Ranger"], ["Duel's Rhythm", "Swashbuckler"], ["Dead Eye", "Gunslinger"]]) assert.ok(!advFirst(feat(n, c).rules), `${n}: no attack Advantage`);
assert.equal(feat("Advanced Favoured Enemy improves", "Ranger").applies[0].rounds, "encounter");
const kit = n => { const k = kits.find(x => x.name === n); assert.ok(k, n); return k.system.features; };
assert.deepEqual(kit("Red Waste Marauder (Barbarian)")[0].applies[0].statuses, ["prone"]);
for (const n of ["Deity: Akadi (Cleric)", "Deity: Annam (Cleric)", "Deity: Annam (Paladin)", "Deity: Lathander (The Dawning Light) (Cleric)", "The Sharpshooter (Fighter)", "Grave Warden (Necromancer)"]) assert.ok(!advFirst(kit(n)[0].rules), `${n}: no attack Advantage`);
assert.ok(!advFirst(kit("Frontier Vanguard (Ranger)")[1].rules));

/* Kits renamed for the Wall's forts keep their ids. */
assert.equal(kits.find(k => k.name === "Westfront Wall-Archer (Archer)")?._id, "zDMRX1wfcZ7EVA2X");
assert.equal(kits.find(k => k.name === "Westfront Defender (Gunslinger)")?._id, "d4dE6lsDguQT2COi");
assert.ok(!kits.some(k => /Dunwell/.test(k.name)));

/* Ancestries (K39 to K41). */
const a = n => anc.find(x => x.name === n).system;
assert.ok(!advFirst(a("Goblin").rules) && a("Goblin").rules.some(r => /Mob Tactics/.test(r.value)));
assert.ok(a("Halfling").rules.some(r => r.key === "adv.save" && /fear/.test(r.when)));
assert.ok(a("Orc").rules.some(r => /Orcish Charge/.test(String(r.value))));
const longtooth = a("Shifter").choice.options.find(o => o.name.endsWith("Longtooth"));
assert.ok(!advFirst(longtooth.rules) && /Prone/.test(longtooth.rules[0].value));
assert.deepEqual([longtooth.uses.max, longtooth.uses.per], [1, "encounter"]);
assert.ok(a("Shifter").choice.options.every(o => o.rules.some(r => r.key === "toggle.ends" && r.value === "encounter")), "the shift ends with the encounter");
const dread = kit("Boldock Wall-Knights (Knight)").find(f => f.name === "Wall-Forged Dread");
assert.deepEqual([dread.applies[0].statuses, dread.applies[0].rules.length], [["frightened"], 0]);
const M = await import("../arneyan/module/migrate.mjs");
assert.equal(M.CLASS_REWORK, "0.10.79", "the class rework runs again for Cauldron Brews");
assert.equal(M.SHIFT_REWORK, "0.10.79");
assert.ok(/Celestial Wings/.test(a("Aasimar").description) && !/Lay on Hands heal/.test(a("Aasimar").description));

/* The Star Spawn Grue's aura: Disadvantage on Will saves. */
const grue = read("monsters", "actors_").find(m => m.name === "Star Spawn Grue");
assert.ok(JSON.stringify(grue).includes('"adv.save.will"'), "the aura carries Disadvantage on Will saves");
console.log("OK 0.10.79 books v0.10.36 and v0.10.37");

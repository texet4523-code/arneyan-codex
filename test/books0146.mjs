// Books HB v0.10.46 and M&T v0.10.44 (B-F32, B-F33, B-F34; K53 and W4) in the system (0.10.84).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
for (const k of ["Actor", "Item", "Combatant", "ChatMessage"]) globalThis[k] ??= class {};

const D = await import("../arneyan/module/documents.mjs");
const M = await import("../arneyan/module/migrate.mjs");
const read = (dir, prefix) => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith(prefix))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const src = p => fs.readFileSync(new URL(`../arneyan/module/${p}`, import.meta.url), "utf8");

/* Power Attack: HB v0.10.87 drops its limits (first attack only, never with other Disadvantage). */
const NONE = { values: [], adv: [], dis: [] };
const own = { values: [-1], adv: [], dis: ["Power Attack"] };
assert.deepEqual(D.powerAttackFor(own, [NONE], { first: true }), { own, off: "" }, "first attack, no other Disadvantage: counts");
assert.deepEqual(D.powerAttackFor(own, [NONE], { first: false }), { own, off: "" }, "a later attack counts too");
assert.equal(D.powerAttackFor(own, [{ values: [-2], adv: [], dis: ["Extra Attack"] }], { first: true }).off, "", "and one that already has Disadvantage");
assert.deepEqual(D.powerAttackFor({ values: [1], adv: ["Bless"], dis: [] }, [NONE]).off, "", "not on: nothing to do");
assert.ok(/noPowerAttack/.test(src("chat.mjs")) && /noPowerAttack\) own\.notes = own\.notes\.filter/.test(src("documents.mjs")), "no extra die on the damage card");
const pa = read("feats", "items_Power_Attack_")[0];
assert.ok(/you may make an attack with/.test(pa.system.description) && !/first attack each round/.test(pa.system.description), "HB v0.10.87: no limits");

/* Bloodied recharges no spells; one of Harm and Mass Harm a fight (M&T v0.10.44). */
assert.ok(/i\.type !== "spell" && !villainNo\(i\) && \["day", "rest", "encounter"\]/.test(src("solo.mjs")));
assert.ok(/spells don't/.test(src("solo.mjs")) && /n !== 2 \? \[\]/.test(src("solo.mjs")), "at the first phase change only (K159)");
const monsters = read("monsters", "actors_");
const solos = monsters.filter(m => m.system.details.isSolo);
assert.ok(solos.every(m => /at its first phase change only, its breath weapons and other limited-use abilities recover \(never spells\)/.test(m.system.details.description)));
// K159: the "only one of Harm and Mass Harm" line is cut.
assert.ok(!solos.some(m => /Harm and Mass Harm/.test(m.system.details.description)));
const sphinx = monsters.find(m => m.name === "Sphinx, Elder");
assert.ok(!sphinx.items.some(i => i.type === "spell" && /^heal$/i.test(i.name)), "the Elder Sphinx casts no Heal");

/* Warlock (HB v0.10.86): one blast, 4d8 from 17th; a signature blast for 1 Patron Favour. */
const eb = read("class-features", "items_Eldritch_Blast_")[0];
{ const t = eb.system.description.replace(/<[^>]+>/g, "").replace(/\s+/g, " "); assert.ok(/4d8 at 17th/.test(t) && /signature blast/.test(t), t.slice(0, 300)); }

/* Ophidian (W4): the lineage renamed, same rules; existing characters renamed in place. */
const shifter = read("ancestries", "items_Shifter_")[0];
const oph = shifter.system.choice.options.find(o => /^Ophidian/.test(o.name));
assert.equal(oph.name, "Ophidian");
assert.ok(/yuan-ti blood/.test(oph.text));
assert.ok(oph.rules.some(r => r.key === "note.attack" && /^Ophidian: a successful unarmed bite/.test(r.value)));
assert.ok(!JSON.stringify(shifter).includes("Sslyth"));
assert.equal(M.renameOphidian("Lineage: Ophidian-Sslyth"), "Lineage: Ophidian");
assert.ok(M.OPHIDIAN.test("Lineage: Ophidian-Sslyth") && !M.OPHIDIAN.test("Lineage: Ophidian"));
{
  // A pre-0.10.79 Ophidian-Sslyth: renamed, and the shift rework still reaches it in the same pass (review, 3 Nov).
  const ancUuid = `Compendium.arneyan.ancestries.Item.${shifter._id}`;
  const anc = { id: "anc1", type: "ancestry", name: "Shifter (Ophidian-Sslyth)", flags: { core: { sourceId: ancUuid }, arneyan: { ancestry: { choice: "Ophidian-Sslyth" } } }, _stats: { compendiumSource: ancUuid }, system: shifter.system };
  const old = "Sslyth: a successful unarmed bite forces a Fortitude save (Ancestry Save DC, Constitution) or the target is poisoned for the shift's duration.";
  const ab = { id: "ab1", type: "ability", name: "Lineage: Ophidian-Sslyth", flags: { arneyan: { grantedBy: "anc1", toggleSet: true } },
    system: { toggle: true, rules: [{ key: "note.attack", value: old, when: "", label: "Ophidian-Sslyth" }], description: "<p>Ophidian-Sslyth bite</p>" } };
  const items = [anc, ab];
  const actor = { name: "Test", items: { get: id => items.find(i => i.id === id), find: f => items.find(f) } };
  const ups = await M.updatesFor(items, actor, async u => (u === ancUuid ? shifter : null), { legacy: "skip", notes: { kept: [], unstamped: 0, unstampedActors: new Set() } });
  const a = ups.find(u => u._id === "anc1"), b = ups.find(u => u._id === "ab1");
  assert.equal(a.name, "Shifter (Ophidian)");
  assert.equal(a["flags.arneyan.ancestry.choice"], "Ophidian");
  assert.equal(b.name, "Lineage: Ophidian");
  assert.ok(b["flags.arneyan.shiftSet"] && b["system.uses"]?.per === "encounter", "the shift rework in the same pass");
  assert.ok(/^Ophidian: a successful unarmed bite/.test(b["system.rules"][0].value) && /Poisoned\.$/.test(b["system.rules"][0].value));
}
/* 0.10.85: the solo update read game.scenes (a Collection, no flatMap) as an array and threw, so no world update finished. */
assert.ok(/\.\.\.\[\.\.\.\(game\.scenes \?\? \[\]\)\]\.flatMap/.test(src("migrate.mjs")));
assert.ok(/console\.warn\("Arneyan \| Legendary Resistance step", err\)/.test(src("migrate.mjs")), "the step can't block the update");
assert.ok(!/(\(game\.(scenes|actors|items|combats|messages|users|folders|journal) \?\? \[\]\)|\bgame\.(scenes|actors|items|combats|messages|users|folders|journal))\.(flatMap|at|includes|slice|indexOf|concat|every)\(/.test(fs.readdirSync(new URL("../arneyan/module/", import.meta.url)).filter(f => f.endsWith(".mjs")).map(f => src(f)).join("\n")), "no Collection read as an array");
console.log("books0146: ok");

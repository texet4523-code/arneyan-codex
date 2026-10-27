// B-F6: cosmic alignment (books v0.10.19 B4, v0.10.20 fix build): Outlook, Allegiance, Divine Favour.
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeItem, makeActor, hbs } from "./harness.mjs";

const root = new URL("../arneyan/", import.meta.url).pathname;
const F = await import("../arneyan/module/favour.mjs");
const { CharacterData, NpcData } = await import("../arneyan/module/data/actor-models.mjs");
const IM = await import("../arneyan/module/data/item-models.mjs");
const M = await import("../arneyan/module/migrate.mjs");
const pack = dir => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.endsWith(".json"))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));

/* Reading alignments. */
assert.equal(F.readAlignment("LG"), "Lawful Good");
assert.equal(F.readAlignment("neutral"), "True Neutral");
assert.equal(F.readAlignment("chaotic  evil"), "Chaotic Evil");
assert.equal(F.readAlignment("Unaligned"), "Unaligned");
assert.equal(F.readAlignment("Evil"), "Evil");
assert.equal(F.readAlignment("whatever"), "");

/* Characters: Unaligned by default; divine service while not Forsaken; a pact; the GM's own wins. */
const cls = name => makeItem(IM.ClassData, "class", name, { levels: 3 });
const kit = (name, className, alignment = "") => makeItem(IM.KitData, "kit", name, { className, alignment });
const torm = kit("Deity: Torm (The Enduring Duty) (Paladin)", "Paladin", "Lawful Good");
assert.deepEqual(F.characterAllegiance({ items: [cls("Fighter")] }).value, "Unaligned");
assert.equal(F.characterAllegiance({ items: [cls("Paladin"), torm] }).value, "Lawful Good");
assert.match(F.characterAllegiance({ items: [cls("Paladin"), torm] }).from, /Torm/);
assert.equal(F.characterAllegiance({ items: [cls("Paladin"), torm], favour: "strained" }).value, "Lawful Good", "a Strained servant keeps the god's Allegiance");
assert.equal(F.characterAllegiance({ items: [cls("Paladin"), torm], favour: "forsaken" }).value, "Unaligned", "Forsaken: service ends");
assert.equal(F.characterAllegiance({ items: [cls("Paladin"), torm], override: "Neutral Evil" }).value, "Neutral Evil", "profane acts: the GM sets it");
assert.ok(F.characterAllegiance({ items: [cls("Cleric")] }).unset, "a Cleric with no deity kit yet");
const bp = F.servantOf([cls("Cleric (Battle Priest)"), kit("Deity: Helm (The Vigilant End) (Cleric)", "Cleric", "Lawful Neutral")]);
assert.equal(bp.label, "Battle Priest"); assert.equal(bp.key, "wis");
assert.equal(F.servantOf([cls("Paladin")]).key, "cha", "R6: Paladins check Charisma");
assert.equal(F.godOf(bp.kit), "Helm (The Vigilant End)");
assert.equal(F.characterAllegiance({ items: [cls("Warlock"), kit("Zariel (Warlock)", "Warlock", "Lawful Evil")] }).value, "Lawful Evil");
assert.equal(F.characterAllegiance({ items: [cls("Warlock"), kit("Orcus (Warlock)", "Warlock")] }).value, "Evil", "a fiend pact makes you Evil");
assert.ok(F.characterAllegiance({ items: [cls("Warlock"), kit("Tiandra (Warlock)", "Warlock")] }).unset, "a fey patron with no alignment yet");

/* Creatures by nature (M&T p.4, m30). */
assert.equal(F.npcAllegiance({ type: "fiend (devil)" }).value, "Lawful Evil");
assert.equal(F.npcAllegiance({ type: "fiend (demon, shapechanger)" }).value, "Chaotic Evil");
assert.equal(F.npcAllegiance({ type: "fiend (yugoloth)" }).value, "Neutral Evil");
assert.equal(F.npcAllegiance({ type: "celestial" }).value, "Good");
assert.equal(F.npcAllegiance({ type: "undead (incorporeal)" }).value, "Evil");
assert.equal(F.npcAllegiance({ type: "humanoid (goblinoid)" }).value, "Unaligned");
assert.equal(F.npcAllegiance({ type: "fey" }).value, "Unaligned", "other outsiders are Unaligned");
assert.equal(F.npcAllegiance({ type: "humanoid", override: "Lawful Evil" }).value, "Lawful Evil", "its entry serves a power");

/* Rules that name an alignment go by Allegiance; Unaligned never registers. */
assert.equal(F.allegianceMatches("vs evil creatures", "Lawful Evil"), true);
assert.equal(F.allegianceMatches("vs evil creatures", "Unaligned"), false);
assert.equal(F.allegianceMatches("vs evil creatures", "Good"), false);
assert.equal(F.allegianceMatches("against good", "Good"), true);
assert.equal(F.allegianceMatches("a good luck charm", "Good"), null, "only rule wording counts");
assert.equal(F.allegianceMatches("on a hit", "Evil"), null);
const notes = F.annotateAllegiance(["Blessed Weapon: +1d6 radiant vs evil creatures", "Keen Edge: +1 damage"], [{ name: "Imp", allegiance: "Lawful Evil" }, { name: "Goblin", allegiance: "Unaligned" }]);
assert.match(notes[0], /Imp counts \(Lawful Evil\); Goblin doesn't \(Unaligned\)/);
assert.equal(notes[1], "Keen Edge: +1 damage");
assert.deepEqual(F.annotateAllegiance(["x vs evil creatures"], []), ["x vs evil creatures"], "no targets, no change");
const spells = pack("spells");
for (const n of ["Holy Word", "Protection from Alignment", "Dispel Alignment", "Magic Circle vs Alignment", "Detect Alignment"]) {
  assert.ok(F.itemNamesAlignment(spells.find(s => s.name === n)), n);
}
assert.ok(!F.itemNamesAlignment(spells.find(s => s.name === "Fireball")));
const feats = pack("class-features");
for (const n of ["Smite Evil", "Change Alignment", "Mark of the Saint"]) assert.ok(!F.itemNamesAlignment(feats.find(x => x.name === n)), `${n}: alignment doesn't matter`);
assert.ok(F.itemNamesAlignment(feats.find(x => x.name === "Divine Protection")));
assert.equal(F.allegianceMatches("vs chaotic evil creatures", "Lawful Evil"), false, "both words");
assert.equal(F.allegianceMatches("vs chaotic evil creatures", "Chaotic Evil"), true);
assert.equal(F.allegianceMatches("vs non-evil creatures", "Lawful Good"), true);
assert.equal(F.allegianceMatches("vs non-evil creatures", "Neutral Evil"), false);
assert.equal(F.allegianceMatches("vs non-evil creatures", "Unaligned"), false, "Unaligned never registers");

/* Forsaken: the servant's class abilities and deity kit; other classes' stay. Strained: the highest slots. */
const s = F.servantOf([cls("Cleric"), kit("Deity: Bane (Cleric)", "Cleric", "Lawful Evil")]);
assert.ok(F.lostToForsaken({ system: { className: "Cleric" } }, s));
assert.ok(F.lostToForsaken(s.kit, s));
assert.ok(!F.lostToForsaken({ system: { className: "Fighter" } }, s));
assert.ok(F.lostToForsaken({ system: { className: "Deity: Bane (Cleric)" } }, s), "the kit's own features");
/* A Forsaken Cleric keeps what the god doesn't grant (Kieran, 27 Oct); a Paladin loses every class ability. */
assert.ok(!F.lostToForsaken({ type: "ability", name: "Extra Attack (Battle Priest only)", system: { className: "Cleric" } }, s));
assert.ok(!F.lostToForsaken({ type: "ability", name: "Wisdom Bonus", system: { className: "Cleric" } }, s));
assert.ok(F.lostToForsaken({ type: "ability", name: "Turn Undead", system: { className: "Cleric" } }, s));
const ps = F.servantOf([cls("Paladin"), torm]);
assert.ok(F.lostToForsaken({ type: "ability", name: "Extra Attack", system: { className: "Paladin" } }, ps), "Paladins lose all");
assert.ok(F.lostToForsaken({ type: "spell", name: "Bless", system: { className: "" } }, s, "Cleric"), "a spell with no class goes by its caster");
/* A Cleric/Paladin serving one god. */
const multi = F.servantOf([cls("Cleric"), cls("Paladin"), torm]);
assert.equal(multi.label, "Paladin", "the kit says which");
assert.ok(F.lostToForsaken({ type: "ability", name: "Lay on Hands", system: { className: "Paladin" } }, multi));
assert.ok(F.lostToForsaken({ type: "ability", name: "Turn Undead", system: { className: "Cleric" } }, multi));
assert.equal(F.characterAllegiance({ items: [cls("Cleric"), cls("Paladin"), torm] }).value, "Lawful Good");
assert.equal(F.strainedKey({ system: { className: "Paladin" } }, multi), "cha");
assert.equal(F.strainedKey({ system: { className: "Cleric" } }, multi), "wis");
assert.equal(F.highestSlotLevel({ slots: [null, { total: 3 }, { total: 2 }, { total: 0 }] }), 2);
assert.ok(F.isTurnUndead("Turn Undead") && F.isTurnUndead("Control Undead") && !F.isTurnUndead("Undead Bane"));

/* The data models. */
const pal = makeActor(CharacterData, "character", { details: { favour: "strained", alignment: "Lawful Good", tenets: "Never refuse a fair challenge" } }, [cls("Paladin"), torm]);
assert.equal(pal.system.favour, "strained");
assert.equal(pal.system.allegiance.value, "Lawful Good");
assert.equal(pal.system.servant.label, "Paladin");
const fighter = makeActor(CharacterData, "character", { details: { favour: "forsaken" } }, [cls("Fighter")]);
assert.equal(fighter.system.favour, "", "Favour is for servants only");
assert.equal(fighter.system.allegiance.value, "Unaligned");
const imp = makeActor(NpcData, "npc", { details: { type: "fiend (devil)" } });
assert.equal(imp.system.allegiance.value, "Lawful Evil");

/* The sheet. */
const render = hbs(root);
const ctx = F.alignmentContext(pal);
assert.equal(ctx.servant.attr, "Charisma");
assert.equal(ctx.favourLabel, "Strained");
const html = render("templates/actor/alignment.hbs", { alignment: ctx, source: pal._source.system, isGM: true });
assert.match(html, /name="system.details.tenets" value="Never refuse a fair challenge"/);
assert.match(html, /<strong class="arn-allegiance-value">Lawful Good<\/strong>/);
assert.match(html, /<option value="strained" selected>Strained<\/option>/);
assert.match(html, /DC 12 Charisma check/);
const asPlayer = render("templates/actor/alignment.hbs", { alignment: ctx, source: pal._source.system, isGM: false });
assert.ok(!/name="system.details.allegiance"/.test(asPlayer) && !/name="system.details.favour"/.test(asPlayer), "players see Allegiance and Favour, the GM sets them");
assert.ok(!/—/.test(html), "no em dashes");
const sheet = fs.readFileSync(`${root}templates/actor/actor-sheet.hbs`, "utf8");
assert.match(sheet, /templates\/actor\/alignment.hbs/);
assert.match(sheet, /Outlook <input type="text" name="system.details.alignment"/, "creatures: Outlook");
assert.match(sheet, /acting on a tenet at real cost/);

/* The kits: every god's alignment from the wiki, and its page (B-W1). */
const kits = pack("kits").filter(k => k.system);
const deity = kits.filter(k => /^deity:/i.test(k.name));
assert.equal(deity.length, 88, "44 gods, Cleric and Paladin");
for (const k of deity) {
  assert.ok(F.ALIGNMENTS.includes(k.system.alignment), `${k.name}: ${k.system.alignment}`);
  assert.match(k.flags?.arneyan?.wiki ?? "", /^https:\/\/app\.kanka\.io\/w\/198952\/entities\/\d+$/, k.name);
  assert.match(k.system.description, /Tenets:<\/strong> on <a href=/, k.name);
}
const byName = n => kits.find(k => k.name === n);
assert.equal(byName("Deity: Abadar (Cleric)").system.alignment, "Lawful Neutral");
assert.equal(byName("Deity: Kossuth (Paladin)").system.alignment, "True Neutral", "the wiki's Neutral");
assert.equal(byName("Deity: Torm (The Enduring Duty) (Paladin)").system.alignment, "Lawful Good");
const patrons = kits.filter(k => /warlock/i.test(k.system.className));
assert.equal(byName("Zariel (Warlock)").system.alignment, "Lawful Evil", "an archdevil by nature");
assert.equal(byName("Orcus (Warlock)").system.alignment, "Chaotic Evil", "a demon lord by nature");
assert.equal(byName("Belial & Fierna (Warlock)").system.alignment, "Lawful Evil");
assert.deepEqual(patrons.filter(k => !k.system.alignment).map(k => k.name), [], "every patron has one");
assert.equal(byName("Bolothamogg (Warlock)").system.alignment, "Chaotic Evil", "Kieran, 27 Oct");
assert.equal(byName("The Queen of Air and Darkness (Warlock)").system.alignment, "Chaotic Evil");
assert.equal(byName("Tiandra (Warlock)").system.alignment, "Chaotic Good");
assert.equal(byName("Verenestra (Warlock)").system.alignment, "Chaotic Neutral");
assert.ok(patrons.every(k => k.flags?.arneyan?.wiki), "every patron links its wiki page");

/* Books v0.10.20. */
const atone = spells.find(x => x.name === "Atonement").system.description;
assert.match(atone, /A god's servant moves one step towards Favoured/);
assert.match(atone, /loses an Evil Allegiance from profane acts/);
assert.match(atone, /restores an Outlook changed by magic/);
const book2 = pack("rules").find(j => /Character Creation/.test(j.name));
const b2 = JSON.stringify(book2);
assert.match(b2, /pull a mortal towards Evil/);
assert.match(b2, /Gods, fiends, celestials and the undead have one by nature/);
assert.match(b2, /DC 12 check with your key attribute/);
const bard = pack("class-features").find(x => x.name === "Change Alignment");
assert.match(bard.system.description, /their Outlook shifts one step/);

/* Worlds: a kit copy from before gets the alignment and wiki page; a GM's own alignment stays. */
const old = { type: "kit", name: "Deity: Abadar (Cleric)", system: { className: "Cleric", alignment: "", features: [] }, flags: {} };
const src = { type: "kit", name: "Deity: Abadar (Cleric)", system: { className: "Cleric", alignment: "Lawful Neutral", features: [] }, flags: { arneyan: { wiki: "https://app.kanka.io/w/198952/entities/7508951" } } };
const upd = M.kitFill(old, src);
assert.equal(upd["system.alignment"], "Lawful Neutral");
assert.equal(upd["flags.arneyan.wiki"], src.flags.arneyan.wiki);
const own = M.kitFill({ ...old, system: { ...old.system, alignment: "Lawful Evil" } }, src);
assert.ok(!("system.alignment" in own), "a GM's own alignment stays");
assert.deepEqual(M.kitFill({ ...old, flags: { arneyan: { keepCustom: true } } }, src), {}, "Keep my edits");
{ const r = {}; const u = M.refreshFrom(old, src, { legacy: "skip", report: r });
  assert.ok(!r.unstamped && !Object.keys(u).some(k => k.startsWith("system.")), "an unstamped kit that matches isn't held back by the fill"); }
const mig = fs.readFileSync(`${root}module/migrate.mjs`, "utf8");
assert.match(mig, /if \(i\.type === "kit"\) Object\.assign\(upd, kitFill\(i, src\)\);/, "the fill runs beside the refresh");
assert.match(fs.readFileSync(`${root}templates/item/item-sheet.hbs`, "utf8"), /name="system.alignment"/, "a kit's alignment can be typed");

console.log("favour: all checks pass");

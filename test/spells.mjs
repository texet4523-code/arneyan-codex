// Spell mechanics against the book text (Spellcasting in Arneyan v2, Handbook v0.9.9 Master Spell List), and the
// Assassin's Skills feature. Run after a build (python3 build/build.py && node build/pack.mjs); content.mjs runs it too.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

globalThis.Roll ??= { replaceFormulaData: (f, d) => f.replace(/@([\w.]+)/g, (_, p) => String(p.split(".").reduce((o, k) => o?.[k], d) ?? 0)) };
const root = new URL("../", import.meta.url).pathname;
const { resolveFormula } = await import("../arneyan/module/rolls.mjs");
const pack = name => {
  const dir = path.join(root, "packs-src", name);
  return fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(path.join(dir, f))));
};
const plain = h => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const sp = pack("spells").filter(d => d.type === "spell");
const byName = Object.fromEntries(sp.map(d => [d.name, d]));
const s = n => byName[n].system;
const at = (n, cl) => resolveFormula(s(n).damage, { cl }).replace(/\s+/g, "");

// ---- Saves: every spell with a save says what the save does, in the words chat.mjs and areas.mjs read.
for (const d of sp) {
  const { save, saveEffect } = d.system;
  if (save) assert.ok(saveEffect, `${d.name}: a save with no "On a save" line`);
  if (/^half/i.test(saveEffect)) assert.ok(!/negat/i.test(saveEffect), `${d.name}: a half-damage line must not say "negates" (chat.mjs reads it as no damage)`);
}
// The same rule chat.mjs applies (kept in step with saveMultiplier there).
const chatSrc = fs.readFileSync(path.join(root, "arneyan/module/chat.mjs"), "utf8");
assert.match(chatSrc, /export function saveMultiplier/);
const mult = t => (/\bfull damage\b/i.test(t) ? 1 : /negat/i.test(t) ? 0 : 0.5);
assert.equal(mult(s("Fireball").saveEffect), 0.5, "Fireball: Reflex halves");
assert.equal(mult(s("Acid Splash").saveEffect), 0, "Acid Splash: Reflex negates");
assert.equal(mult(s("Sound Burst").saveEffect), 1, "Sound Burst: the damage is not saved against");
assert.equal(mult(s("Evard's Black Tentacles").saveEffect), 1, "Evard's: the save negates Restrained, the damage still applies");
assert.equal(mult(s("Finger of Death").saveEffect), 1, "Finger of Death: a save takes the damage instead of dying");
assert.equal(mult(s("Shatter").saveEffect), 0.5, "Shatter: Fortitude halves");
assert.equal(mult(s("Web").saveEffect), 0.5, "Web: the fire damage, Reflex halves");
// Saves the Save column leaves out but the text states.
assert.equal(s("Forcecage").save, "ref"); assert.equal(s("Polymorph").save, "will"); assert.equal(s("Mislead").save, "will");

// ---- Damage the text states, with its scaling.
assert.equal(at("Magic Missile", 1), "1d4+1", "1 missile at 1st"); assert.equal(at("Magic Missile", 6), "3d4+3"); assert.equal(at("Magic Missile", 14), "5d4+5", "max 5 missiles");
assert.equal(at("Melf's Minute Meteors", 4), "4d4"); assert.equal(at("Melf's Minute Meteors", 15), "10d4", "max 10 meteors");
assert.equal(at("Glyph of Warding", 1), "1d8"); assert.equal(at("Glyph of Warding", 7), "3d8"); assert.equal(at("Glyph of Warding", 20), "5d8");
assert.equal(s("Glyph of Warding").damageType, "thunder");
assert.equal(s("Meteor Swarm").damage, "10d6 + 10d6"); assert.equal(s("Prismatic Spray").damage, "10d6");
for (const [n, f, t] of [["Spike Growth", "1d4", "piercing"], ["Spike Stones", "1d8", "piercing"], ["Wall of Thorns", "2d6", "piercing"], ["Animate Objects", "1d8", "bludgeoning"]]) {
  assert.equal(s(n).damage, f, n); assert.equal(s(n).damageType, t, n);
}
assert.ok(plain(s("Magic Missile").description).includes("each missile deals 1d4+1"), "Magic Missile explains the split");
assert.equal(s("Cure Light Wounds").damageType, "healing", "healing stays healing");
// Text with dice and "damage" and no formula: only the ones rolled by hand (mishaps, falls, side effects) or done elsewhere.
const BY_HAND = ["Aid", "Bless Water", "Earthquake", "Ethereal Jaunt", "Meld into Stone", "Restoration", "Reverse Gravity", "Shillelagh", "Spirit Guardians", "Teleport"];
for (const d of sp) {
  if (d.system.damage || BY_HAND.includes(d.name)) continue;
  assert.ok(!/\d+d\d+[^.;]{0,40}\bdamage/.test(plain(d.system.description).split(" Classes:")[0]), `${d.name}: the text states damage the item doesn't roll`);
}

// ---- Areas stated after the opening line, and how long they stay.
const tpl = n => s(n).template;
assert.deepEqual([tpl("Sunbeam").type, tpl("Sunbeam").size, tpl("Sunbeam").width], ["line", 60, 5]);
assert.deepEqual([tpl("Repel Metal or Stone").type, tpl("Repel Metal or Stone").size, tpl("Repel Metal or Stone").fromSelf], ["cone", 60, true]);
for (const [n, size] of [["Call Lightning", 10], ["Explosive Runes", 10], ["Glyph of Warding", 5], ["Fire Trap", 5], ["Fire Seeds", 10], ["Creeping Doom", 20], ["Meteor Swarm", 20], ["Symbol", 30], ["Pyrotechnics", 20]]) {
  assert.equal(tpl(n).type, "circle", n); assert.equal(tpl(n).size, size, n);
}
assert.equal(tpl("Creeping Doom").rounds, "min(1*@cl, 10)");
assert.equal(tpl("Evard's Black Tentacles").lingering, true); assert.equal(tpl("Spike Stones").rounds, "600*@cl");
assert.equal(tpl("Prismatic Spray").lingering, false, "Prismatic Spray is instant");
assert.equal(tpl("Wail of the Banshee").fromSelf, true, "40ft radius around you");

// ---- Assassin's Skills: one feature, named as the Handbook (p. 55) names it.
const cf = pack("class-features").filter(d => d.type === "ability" && d.system.className === "Assassin");
assert.ok(!cf.some(d => d.name === "GM rolls secretly"), "no stray 'GM rolls secretly' feature");
const skills = cf.filter(d => d.name === "Assassin's Skills");
assert.equal(skills.length, 1);
const sk = plain(skills[0].system.description);
for (const w of ["Case Target (Wisdom)", "Climb (Dexterity)", "Disguise (Charisma)", "GM rolls secretly.", "Hide (Dexterity)", "Identify Poison (Intelligence)", "Listen (Wisdom)", "Move Silently (Dexterity)", "Traps (Intelligence)"]) {
  assert.ok(sk.includes(w), `Assassin's Skills: ${w}`);
}
const assassin = pack("classes").find(d => d.name === "Assassin");
assert.deepEqual(assassin.system.features.filter(f => f.level === 1).map(f => f.name), ["Class Skills", "Death Attack", "Sneak Attack", "Killer's Precision", "Assassin's Skills"]);
assert.ok(!assassin.system.description.includes("<h4>GM rolls secretly</h4>"));

console.log("OK spells");

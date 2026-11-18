// HB and M&T v0.10.85 (B-F81, R-B141, R-B142; K211): Dungeon Phases in the Codex; three M&T lines.
import assert from "node:assert/strict";
import fs from "node:fs";
const dir = new URL("../packs-src/", import.meta.url);
const read = (pack, re) => {
  const f = fs.readdirSync(new URL(pack, dir)).find(n => re.test(n));
  assert.ok(f, `${pack}: ${re}`);
  return fs.readFileSync(new URL(`${pack}/${f}`, dir), "utf8");
};
const rune = read("monsters", /^actors_Rune_Giant_/);
assert.ok(rune.includes("(a goliath or firbolg)") && !/minotaur/i.test(rune), "Rune of Command: goliaths and firbolgs, no minotaurs");
for (const age of ["Wyrmling", "Young", "Adult", "Ancient"]) {
  const b = read("monsters", new RegExp(`^actors_Brine_Dragon_${age}_`));
  assert.ok(b.includes("A dragon of salt and deep water") && !b.includes("A sea dragon of salt"), `Brine dragon ${age}: gm line`);
}
const bahamut = read("monsters", /^actors_Bahamut_/);
assert.ok(bahamut.includes("The Platinum Dragonlord, king of the good dragons") && !/Xymor|Marduk/.test(bahamut), "Bahamut's gm line");
const codex = read("rules", /^journal_Book_I_Core_Rules_/);
assert.ok(codex.includes("roll a single d12 per day travelled or dungeon phase"), "the Encounter Check per day or dungeon phase");
assert.ok(codex.includes("up to 4 dice in all"));
// On the Travelling Rules page, in order, labels in bold, before Resting in Hostile Territory.
const page = JSON.parse(codex).pages.find(p => p.name === "Travelling Rules").text.content;
let at = -1;
for (const s of ["<li>Dungeon Phases.</li>", "<strong>New phase:</strong>", "<strong>1 to 10:</strong>", "<strong>11:</strong>", "<strong>12:</strong>", "<strong>The dungeon stirs:</strong>",
  "<strong>Calming down:</strong>", "<strong>Rising threat:</strong>", "<strong>Encounter tables:</strong>", "<li>Resting in Hostile Territory.</li>"]) {
  const i = page.indexOf(s, at + 1);
  assert.ok(i > at, `Travelling Rules, in order: ${s}`);
  at = i;
}
console.log("OK books v0.10.85");

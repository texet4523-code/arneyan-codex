// R-F23 leftovers (Jacob's Well, 8 Nov 2026): the zombie's Undying card, the dice buttons above the chat box, tall art
// on the sheet; and Jacob's Well out of Foundry (0.10.96). Runs on its own.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
const U = await import("../arneyan/module/undying.mjs");
const T = await import("../arneyan/module/dicetray.mjs");

// Undying: found by name or by its words; the DC is 5 + the damage that dropped it.
const zombie = JSON.parse(fs.readFileSync(new URL("../packs-src/monsters/" + fs.readdirSync(new URL("../packs-src/monsters/", import.meta.url)).find(f => /^actors_Zombie_[A-Za-z0-9]{16}\.json$/.test(f)), import.meta.url), "utf8"));
assert.equal(zombie.name, "Zombie");
assert.ok(U.undyingOf({ items: zombie.items.map(i => ({ ...i })) }), "the Zombie has it");
assert.ok(U.undyingOf({ items: [{ type: "ability", name: "Rot", system: { description: "<p>When reduced to <strong>0 HP</strong> by anything else, it makes a <strong>Fortitude save</strong> (DC 5 + damage taken).</p>" } }] }), "by its words");
assert.equal(U.undyingOf({ items: [{ type: "ability", name: "Bite", system: { description: "1d6" } }] }), undefined);
const card = U.undyingCard("Zombie", 9);
assert.equal(card.dc, 14);
assert.ok(card.content.includes("Fortitude save, DC 14") && card.content.includes("arn-undying-save") && card.content.includes("arn-undying-up"));
assert.ok(card.content.includes("fire, radiant damage or a critical hit"));

// The dice tray: d4 to d100.
const tray = T.diceTrayHtml();
for (const n of [4, 6, 8, 10, 12, 20, 100]) assert.ok(tray.includes(`data-die="${n}"`), `d${n}`);
const main = fs.readFileSync(new URL("../arneyan/module/arneyan.mjs", import.meta.url), "utf8");
assert.ok(main.includes("registerUndying();") && main.includes("registerDiceTray();"));

// Tall art: the sheet's square portrait keeps the top of the picture (faces), not its middle.
const css = fs.readFileSync(new URL("../arneyan/styles/arneyan.css", import.meta.url), "utf8");
assert.ok(/\.arneyan \.arn-portrait \{[^}]*object-position: center top/.test(css));

// Jacob's Well's pregens no longer ship.
assert.ok(!fs.existsSync(new URL("../packs-src/pregens/", import.meta.url)));
console.log("OK undying and tray");

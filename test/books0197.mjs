// M&T 0.10.91 (S-F12, R-S25, K313) in the system (0.10.139): the six monsters whose saves moved with their Level have
// their printed DCs moved by 1 too. Foundry keeps each block's printed DCs (structured dc and spellDC, and the text).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

const dir = new URL("../packs-src/monsters/", import.meta.url);
const mon = Object.fromEntries(fs.readdirSync(dir).filter(f => f.startsWith("actors_")).map(f => JSON.parse(fs.readFileSync(new URL(f, dir), "utf8"))).map(d => [d.name, d]));
const dcs = n => mon[n].items.map(i => i.system?.dc).filter(Boolean);
const text = n => mon[n].items.map(i => i.system?.description ?? "").join(" ");
assert.deepEqual(dcs("Galeb Duhr"), [16]);
assert.equal(mon["Galeb Duhr"].system.attributes.spellDC, 12);
assert.equal(mon["Cult Fanatic"].system.attributes.spellDC, 14);
assert.match(text("Cult Fanatic"), /Will DC 14/);
assert.deepEqual(dcs("Mammoth"), [21]);
assert.deepEqual(dcs("Allip"), [14, 14]);
assert.deepEqual(dcs("Mind Flayer"), [18]);
assert.equal(mon["Mind Flayer"].system.attributes.spellDC, 18);
assert.match(text("Mind Flayer"), /escape[^.]*DC 14|DC 14[^.]*escape/i);
assert.deepEqual(dcs("Mind Flayer Arcanist"), [19]);
assert.equal(mon["Mind Flayer Arcanist"].system.attributes.spellDC, 20);
assert.ok(!/DC 18\b/.test(text("Mind Flayer Arcanist")), "no old DCs left");
const lock = JSON.parse(fs.readFileSync(new URL("../build/site.lock", import.meta.url), "utf8"));
assert.equal(lock.books.MT, "0.10.91");
console.log("OK M&T 0.10.91 DCs");

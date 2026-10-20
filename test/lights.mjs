// Light sources: burn timers in game time and real time, putting out and relighting, burning out, the
// nearly-out warning, pausing, and the time left on the sheets and in chat.
import assert from "node:assert/strict";
import { makeItem, makeActor, hbs, sheetContext } from "./harness.mjs";

const root = new URL("../arneyan/", import.meta.url).pathname;
const { CharacterData } = await import("../arneyan/module/data/actor-models.mjs");
const IM = await import("../arneyan/module/data/item-models.mjs");

/* ---------------- Foundry stand-ins ---------------- */
const hooks = {};
globalThis.Hooks = { on: (n, f) => (hooks[n] ??= []).push(f), once: (n, f) => (hooks[n] ??= []).push(f), callAll: (n, ...a) => (hooks[n] ?? []).forEach(f => f(...a)) };
const chat = [];
globalThis.ChatMessage = { create: async m => { chat.push(m); return m; }, getSpeaker: () => ({}) };
const warnings = [];
globalThis.ui = { notifications: { warn: m => warnings.push(m), info: () => {} } };
let mode = "game";
const settings = {};
const owner = { id: "player1", isGM: false }, gm = { id: "gm1", isGM: true }, other = { id: "player2", isGM: false };
Object.assign(game, {
  paused: false,
  user: { ...game.user, id: "gm1", isGM: true },
  users: Object.assign([owner, gm, other], { activeGM: { isSelf: true } }),
  settings: { get: (s, k) => (k === "lightBurn" ? mode : "publicroll"), register: (s, k, cfg) => { settings[k] = cfg; } },
  time: { worldTime: 1000, advance: async dt => { game.time.worldTime += dt; Hooks.callAll("updateWorldTime", game.time.worldTime, dt); } },
  scenes: []
});
foundry.applications.instances = new Map();

const G = await import("../arneyan/module/gear.mjs");
const { advanceTime } = await import("../arneyan/module/worldtime.mjs");
G.registerGear();
assert.equal(settings.lightBurn.default, "game");
assert.deepEqual(Object.keys(settings.lightBurn.choices), ["game", "real"]);
assert.equal(settings.lightBurn.scope, "world");
assert.ok(hooks.updateWorldTime?.length && hooks.pauseGame?.length, "the clock and the pause button reach the lights");

/** A gear item that updates and deletes like a real one. */
function gear(name, src) {
  const it = makeItem(IM.EquipmentData, "equipment", name, src);
  it.update = async changes => { for (const [k, v] of Object.entries(changes)) foundry.utils.setProperty(it.system, k.replace(/^system\./, ""), v); return it; };
  it.delete = async () => { const a = it.actor.items; a.splice(a.indexOf(it), 1); };
  return it;
}
function carrier(items) {
  const a = makeActor(CharacterData, "character", { abilities: { str: { value: 10 } } }, items);
  const flags = {};
  Object.assign(a, { name: "Brannoc", isToken: false, prototypeToken: { light: {} }, getActiveTokens: () => [], update: async () => a,
    getFlag: (s, k) => flags[k], setFlag: async (s, k, v) => { flags[k] = v; }, unsetFlag: async (s, k) => { delete flags[k]; },
    testUserPermission: (u, lvl) => u.isGM || u.id === "player1" });
  return a;
}
const settle = () => G.burnDown();

/* ---------------- The maths ---------------- */
const HOUR = 3600;
assert.equal(G.lightLeft({ hours: 1, lit: false, left: null }), HOUR, "unlit and fresh: the full burn");
assert.equal(G.lightLeft({ hours: 1, lit: true, litAt: 1000, left: null }, { mode: "game", now: 1000 + 1800 }), 1800, "game time: half an hour gone");
assert.equal(G.lightLeft({ hours: 6, lit: true, litAt: 0, left: 600 }, { mode: "game", now: 900 }), 0, "never below 0");
assert.equal(G.lightLeft({ hours: 6, lit: true, litAt: 0, left: 4000 }, { mode: "real", now: 99999 }), 4000, "real time ignores the clock");
assert.equal(G.lightLeft({ hours: 1, lit: true, litAt: 5000, left: null }, { mode: "game", now: 4000 }), HOUR, "the clock wound back burns nothing");
assert.equal(G.lightLeft({ hours: 0, lit: true, litAt: 0 }), Infinity, "no burn time: until put out");
assert.equal(G.lightLeftLabel(2700), "45 min left");
assert.equal(G.lightLeftLabel(2701), "46 min left", "minutes round up");
assert.equal(G.lightLeftLabel(HOUR), "1 h left");
assert.equal(G.lightLeftLabel(5.5 * HOUR), "5 h 30 min left");
assert.equal(G.lightLeftLabel(HOUR + 3590), "2 h left");
assert.equal(G.lightLeftLabel(30), "under a minute left");
assert.equal(G.lightLeftLabel(0), "burnt out");
assert.equal(G.lightLeftLabel(Infinity), "");
assert.deepEqual(G.putOutData({ hours: 1, lit: true, litAt: 1000, left: null }, { mode: "game", now: 2200 }), { "system.light.lit": false, "system.light.litAt": 0, "system.light.left": 2400 });
assert.deepEqual(G.putOutData({ hours: 0, lit: true, litAt: 1000 }), { "system.light.lit": false, "system.light.litAt": 0 }, "an everburning light keeps no time");

/* ---------------- Game time ---------------- */
const torches = gear("Torches", { quantity: 2, consumable: { use: true }, light: { bright: 20, dim: 40, hours: 1 } });
const lantern = gear("Hooded Lantern", { quantity: 1, light: { bright: 30, dim: 60, hours: 6 } });
const hero = carrier([torches, lantern]);
game.actors = { contents: [hero] };

await G.toggleLight(torches);
assert.equal(torches.system.light.lit, true); assert.equal(torches.system.light.litAt, 1000);
assert.ok(chat.at(-1).content.includes("Brannoc lights Torches (1 h left)"), chat.at(-1).content);
// The GM's +10 min, +10 min (worldtime.mjs's advanceTime calls game.time.advance, which fires updateWorldTime).
await advanceTime(600); await settle();
await advanceTime(600); await settle();
assert.equal(Math.round(G.lightLeft(torches.system.light)), 2400, "20 minutes of game time burned");
await G.toggleLight(torches);
assert.ok(chat.at(-1).content.includes("puts out Torches (40 min left)"), chat.at(-1).content);
assert.equal(torches.system.light.left, 2400, "putting it out keeps the time it has left");
await advanceTime(5 * HOUR); await settle();
assert.equal(G.lightLeft(torches.system.light), 2400, "an unlit torch doesn't burn");
await G.toggleLight(torches);
assert.ok(chat.at(-1).content.includes("lights Torches (40 min left)"), "relit, it carries on");

// The sheet: "Lit · 40 min left" beside it, the time left on its own sheet.
const render = hbs(root);
const { ArneyanActorSheet, ArneyanItemSheet } = await import("../arneyan/module/sheets.mjs");
const ctx = await sheetContext(ArneyanActorSheet, hero, { _activeTab: "gear" });
const row = [...ctx.gear.equipment, ...ctx.gear.consumables, ...ctx.gear.equipped].find(r => r.name === "Torches");
assert.equal(row.litLeft, "40 min left"); assert.ok(row.litTip.includes("game time"));
const html = render("templates/actor/actor-sheet.hbs", ctx);
assert.ok(html.includes("Lit · 40 min left"), "the inventory row shows the time left");
const ictx = await sheetContext(ArneyanItemSheet, torches);
assert.equal(ictx.lightTimer.hours, 0.67); assert.equal(ictx.lightTimer.label, "40 min left");
const ihtml = render("templates/item/item-sheet.hbs", ictx);
assert.ok(ihtml.includes('class="short arn-light-left"') && ihtml.includes("arn-light-reset"), "the GM can change the time left");
game.user.isGM = false;
const phtml = render("templates/item/item-sheet.hbs", await sheetContext(ArneyanItemSheet, torches));
assert.ok(!phtml.includes("arn-light-left") && phtml.includes("40 min left (lit)"), "players see it, not change it");
game.user.isGM = true;
assert.equal((await sheetContext(ArneyanItemSheet, gear("Rope", { quantity: 1 }))).lightTimer, null);

// 10 minutes left: the owner (and the GM) are whispered, once.
const before = chat.length;
await advanceTime(31 * 60); await settle();
assert.equal(torches.system.light.warned, true);
const warn = chat.slice(before).find(m => m.whisper);
assert.ok(warn?.content.includes("Torches is nearly out (9 min left)"), warn?.content);
assert.deepEqual(warn.whisper, ["player1", "gm1"], "to the owner, not the whole table");
await advanceTime(60); await settle();
assert.equal(chat.slice(before).filter(m => m.whisper).length, 1, "only once");
// Burns out: one torch of the two is used up; the one left is fresh.
await advanceTime(10 * 60); await settle();
assert.equal(torches.system.quantity, 1, "a burnt-out torch is used up");
assert.equal(torches.system.light.lit, false); assert.equal(torches.system.light.left, null); assert.equal(torches.system.light.warned, false);
assert.ok(chat.at(-1).content.includes("Brannoc's Torches burns out."));
assert.equal(G.lightLeft(torches.system.light), HOUR);

// A lantern just goes out, and won't light again until the GM gives it time.
await G.toggleLight(lantern);
await advanceTime(6 * HOUR); await settle();
assert.ok(hero.items.includes(lantern), "a lantern isn't used up");
assert.equal(lantern.system.light.lit, false); assert.equal(lantern.system.light.left, 0);
assert.ok(chat.at(-1).content.includes("needs more fuel"));
const lctx = await sheetContext(ArneyanActorSheet, hero, { _activeTab: "gear" });
const lrow = [...lctx.gear.equipment, ...lctx.gear.consumables, ...lctx.gear.equipped].find(r => r.name === "Hooded Lantern");
assert.equal(lrow.lightOut, true);
assert.ok(render("templates/actor/actor-sheet.hbs", lctx).includes("Burnt out"));
await G.toggleLight(lantern);
assert.equal(lantern.system.light.lit, false); assert.ok(warnings.at(-1).includes("burned out"));
await G.setLightLeft(lantern, null);
assert.equal(G.lightLeft(lantern.system.light), 6 * HOUR, "reset: a full burn");
await G.setLightLeft(lantern, 2 * HOUR);
assert.equal(G.lightLeft(lantern.system.light), 2 * HOUR, "the GM's hours left");
// A lit light given hours left by the GM counts on from now.
await G.toggleLight(lantern);
await advanceTime(HOUR); await settle();
await G.setLightLeft(lantern, 3 * HOUR);
assert.equal(G.lightLeft(lantern.system.light), 3 * HOUR);
await advanceTime(HOUR); await settle();
assert.equal(G.lightLeft(lantern.system.light), 2 * HOUR);

/* ---------------- Real time ---------------- */
// Switching the setting: lit lights carry on from what they have left.
mode = "real";
await settings.lightBurn.onChange("real"); await G.burnDown();
assert.equal(lantern.system.light.left, 2 * HOUR, "switched to real time with 2 h left");
assert.equal(G.lightLeft(lantern.system.light), 2 * HOUR);
await advanceTime(HOUR); await settle();
assert.equal(G.lightLeft(lantern.system.light), 2 * HOUR, "in real time, the game clock burns nothing");
let t = 1_000_000;
await G.realTick(t);
await G.realTick(t += 60_000);
assert.equal(lantern.system.light.left, 2 * HOUR - 60, "a minute of real time");
await G.realTick(t += 30_000);
assert.equal(lantern.system.light.left, 2 * HOUR - 90);
// Paused: what burned up to the pause counts; nothing while paused.
game.paused = true;
await G.onPauseGame(true, t += 20_000);
assert.equal(lantern.system.light.left, 2 * HOUR - 110, "counted up to the pause");
await G.realTick(t += 60_000); await G.realTick(t += 60_000);
assert.equal(lantern.system.light.left, 2 * HOUR - 110, "pausing stops real-time burning");
game.paused = false;
await G.onPauseGame(false, t += 600_000);
await G.realTick(t += 60_000);
assert.equal(lantern.system.light.left, 2 * HOUR - 170, "the paused time didn't count");
// A long gap (a laptop asleep) counts two minutes at most.
await G.realTick(t += 5 * HOUR * 1000);
assert.equal(lantern.system.light.left, 2 * HOUR - 290);
// Put out and relit in real time: it keeps what it had.
await G.toggleLight(lantern);
await G.realTick(t += 60_000);
assert.equal(lantern.system.light.left, 2 * HOUR - 290, "an unlit lantern doesn't burn");
await G.toggleLight(lantern);
assert.equal(G.lightLeft(lantern.system.light), 2 * HOUR - 290);
const rctx = await sheetContext(ArneyanActorSheet, hero, { _activeTab: "gear" });
assert.ok([...rctx.gear.equipment, ...rctx.gear.consumables, ...rctx.gear.equipped].find(r => r.name === "Hooded Lantern").litTip.includes("real time"));
// Only the active GM's client burns.
game.users.activeGM = { isSelf: false };
await G.realTick(t += 60_000);
assert.equal(lantern.system.light.left, 2 * HOUR - 290, "a player's client leaves it alone");
game.users.activeGM = { isSelf: true };
await G.realTick(t += 60_000);
assert.equal(lantern.system.light.left, 2 * HOUR - 350);

// A torch in real time: warned at 10 minutes, then used up (the last one goes from the sheet).
await G.toggleLight(torches);
await G.setLightLeft(torches, 650);
const before2 = chat.length;
await G.realTick(t += 60_000);
assert.equal(torches.system.light.left, 590); assert.equal(torches.system.light.warned, true);
assert.ok(chat.slice(before2).some(m => m.whisper && m.content.includes("nearly out")));
for (let n = 0; n < 9; n++) await G.realTick(t += 60_000);
assert.ok(torches.system.light.lit, "50 seconds left");
await G.realTick(t += 60_000);
assert.ok(!hero.items.includes(torches), "the last torch burns out and is gone");

// Back to game time: carries on from the time left in real time.
mode = "game";
game.time.worldTime = 50_000;
await settings.lightBurn.onChange("game"); await G.burnDown();
assert.equal(lantern.system.light.litAt, 50_000);
assert.equal(G.lightLeft(lantern.system.light), 2 * HOUR - 1010, "the lantern burned on beside the torch");
await advanceTime(600); await settle();
assert.equal(G.lightLeft(lantern.system.light), 2 * HOUR - 1610);

// Handed to someone else lit: it arrives unlit with the time it had left (documents.mjs, party.mjs).
assert.equal(G.putOutData(lantern.system.light)["system.light.left"], 2 * HOUR - 1610);

console.log("OK lights");

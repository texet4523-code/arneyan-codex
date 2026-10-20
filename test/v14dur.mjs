// Foundry v14 Active Effect durations: v13 { seconds, rounds, turns, startTime } and v14 { value, units } + start.time
// both give an effect its end on the world clock (flags.arneyan.endsAt), on create and when edited later.
import assert from "node:assert/strict";
import { makeActor, sheetContext } from "./harness.mjs";

// Stand-ins, put back afterwards (run.mjs imports this after other tests that share these globals).
const saved = { Hooks: globalThis.Hooks, fromUuidSync: globalThis.fromUuidSync, ChatMessage: globalThis.ChatMessage };
const savedGame = { release: game.release, time: game.time, settings: game.settings, combats: game.combats, users: game.users };
const savedHas = foundry.utils.hasProperty, savedMerge = foundry.utils.mergeObject;
const hooks = {};
globalThis.Hooks = { on: (n, f) => (hooks[n] ??= []).push(f), once: (n, f) => (hooks[n] ??= []).push(f), callAll: (n, ...a) => (hooks[n] ?? []).forEach(f => f(...a)) };
globalThis.fromUuidSync = () => null;
foundry.utils.hasProperty ??= (o, k) => foundry.utils.getProperty(o, k) !== undefined;
game.time = { worldTime: 1000 };
game.combats = new Map();
const settings = {};
game.settings = { get: (s, k) => (k === "clockForPlayers" ? false : "publicroll"), register: (s, k, cfg) => { settings[k] = cfg; } };

const D = await import("../arneyan/module/duration.mjs");
const T = await import("../arneyan/module/worldtime.mjs");
const E = await import("../arneyan/module/effects.mjs");

try {
  /* ---------------- Reading either shape ---------------- */
  const v13 = D.readDuration({ duration: { seconds: 3600, rounds: null, turns: null, startTime: 500, startRound: 2, startTurn: 1, combat: "c1" } });
  assert.deepEqual([v13.shape, v13.seconds, v13.rounds, v13.startTime, v13.startRound, v13.startTurn, v13.combat], ["v13", 3600, 0, 500, 2, 1, "c1"]);
  const v14 = D.readDuration({ duration: { value: 3600, units: "seconds", expiry: "turnStart", expired: false }, start: { time: 500, combat: "c1", round: 2, turn: 1 } });
  assert.deepEqual([v14.shape, v14.seconds, v14.rounds, v14.startTime, v14.startRound, v14.startTurn, v14.combat], ["v14", 3600, 0, 500, 2, 1, "c1"]);
  for (const [units, secs] of [["seconds", 1], ["minutes", 60], ["hours", 3600], ["days", 86400], ["years", 365 * 86400]]) {
    assert.equal(D.readDuration({ duration: { value: 2, units } }).seconds, 2 * secs, `v14 ${units}`);
  }
  assert.equal(D.readDuration({ duration: { value: 4, units: "rounds" } }).rounds, 4);
  assert.equal(D.readDuration({ duration: { value: 4, units: "turns" } }).turns, 4);
  assert.equal(D.readDuration({ duration: { value: 1, units: "months" } }).seconds, 365 * 86400 / 12);
  // v14's default start.time of 0 (and an item copy's) is no start; null start, no duration, junk: nothing, no throw.
  assert.equal(D.readDuration({ duration: { value: 60, units: "seconds" }, start: { time: 0 } }).startTime, null);
  assert.equal(D.readDuration({ duration: { value: 60, units: "seconds" }, start: null }).startTime, null);
  assert.equal(D.readDuration({ duration: { value: null, units: "seconds", expiry: null } }).shape, null, "v14 indefinite");
  assert.equal(D.readDuration({ duration: { startTime: 100, seconds: null, rounds: null } }).shape, null);
  for (const junk of [null, undefined, 5, "x", { duration: "x" }, { duration: { value: "abc", units: 3 } }]) assert.doesNotThrow(() => D.readDuration(junk));
  // A document is read from its stored source, not the prepared duration.
  assert.equal(D.readDuration({ _source: { duration: { value: 2, units: "minutes" } }, duration: { seconds: 999 } }).seconds, 120);
  // A bare duration object.
  assert.equal(D.readDuration({ value: 3, units: "hours" }).seconds, 3 * 3600);
  assert.equal(D.lengthSeconds(D.readDuration({ duration: { value: 3, units: "rounds" } }), 6), 18);
  assert.equal(D.lengthSeconds(D.readDuration({ duration: { value: 2, units: "turns" } }), 6), 12, "turns with no combat: at most a round each");

  /* ---------------- Writing ---------------- */
  assert.deepEqual(D.durationData({ rounds: 10 }, false), { rounds: 10 });
  assert.deepEqual(D.durationData({ rounds: 10 }, true), { value: 10, units: "rounds" });
  assert.deepEqual(D.durationData({ seconds: 600 }, true), { value: 600, units: "seconds" });
  assert.equal(D.durationData({}, true), null);
  game.release = { generation: 13 };
  assert.equal(D.isV14Duration(), false);
  game.release = { generation: 14, build: 367 };
  assert.equal(D.isV14Duration(), true);
  const bless = await E.effectDataFor({ name: "Bless", rounds: 10 }, { name: "Bless", img: "b.svg", uuid: "Item.bless", system: { description: "" } }, { cl: 3 });
  assert.deepEqual(bless.duration, { value: 10, units: "rounds" }, "v14: the system writes v14's shape");
  assert.equal(bless.flags.arneyan.rounds, 10);
  game.release = { generation: 13 };
  assert.deepEqual((await E.effectDataFor({ name: "Bless", rounds: 10 }, { name: "Bless", img: "b.svg", uuid: "Item.bless", system: { description: "" } }, { cl: 3 })).duration, { rounds: 10 }, "v13: as before");

  /* ---------------- endsAtFor, both shapes ---------------- */
  // v13 (as before).
  assert.equal(T.endsAtFor({ duration: { seconds: 3600, startTime: 500 } }, 1000), 4100);
  assert.equal(T.endsAtFor({ duration: { seconds: 3600 } }, 1000), 4600);
  assert.equal(T.endsAtFor({ duration: { rounds: 3 } }, 0), 18);
  assert.equal(T.endsAtFor({ flags: { arneyan: { rounds: 10 } } }, 1000), 1060);
  // v14: what Foundry 14.367 stores for { duration: { seconds: 3600 } } or the effect config's 3600 seconds.
  const live = { duration: { value: 3600, units: "seconds", expiry: "turnStart", expired: false } };
  assert.equal(T.endsAtFor(live, 1000), 4600, "v14 seconds");
  assert.equal(T.endsAtFor({ ...live, start: { time: 500 } }, 1000), 4100, "v14 start.time");
  assert.equal(T.endsAtFor({ ...live, start: { time: 0, combat: null } }, 1000), 4600, "v14 default start.time 0 is now");
  assert.equal(T.endsAtFor({ duration: { value: 10, units: "minutes" } }, 0), 600);
  assert.equal(T.endsAtFor({ duration: { value: 2, units: "hours" } }, 0), 7200);
  assert.equal(T.endsAtFor({ duration: { value: 1, units: "days" } }, 0), 86400);
  assert.equal(T.endsAtFor({ duration: { value: 3, units: "rounds" } }, 0), 18);
  assert.equal(T.endsAtFor({ duration: { value: 3, units: "rounds" } }, 0, { round: 10 }), 30, "the world's round length");
  assert.equal(T.endsAtFor({ duration: { value: 10, units: "rounds" }, flags: { arneyan: { rounds: 10 } } }, 1000), 1060, "the system's own Bless on v14");
  assert.equal(T.endsAtFor({ duration: { value: null, units: "seconds", expiry: null } }, 0), null, "v14 no duration");
  assert.equal(T.endsAtFor({ duration: { value: 5, units: "seconds" }, flags: { arneyan: { endsAt: 77 } } }, 0), 77, "an endsAt already set wins");
  // The creation data carries no duration but the effect's own source does (Foundry fills it in).
  assert.equal(T.endsAtFor({ name: "X" }, 1000, { source: { duration: { value: 60, units: "seconds" }, start: { time: 990 } } }), 1050);
  assert.equal(T.endsAtFor(live, 1000, { source: { duration: live.duration, start: { time: 1000 } } }), 4600);

  /* ---------------- The hooks ---------------- */
  T.registerWorldTime();
  assert.ok(hooks.preCreateActiveEffect?.length && hooks.preUpdateActiveEffect?.length);
  const fakeEffect = (source, data = source) => {
    const e = { _source: foundry.utils.deepClone(source), flags: foundry.utils.deepClone(source.flags ?? {}), name: source.name ?? "Effect", id: Math.random().toString(36).slice(2) };
    e.updateSource = u => { for (const [k, v] of Object.entries(u)) { foundry.utils.setProperty(e._source, k, v); foundry.utils.setProperty(e, k, v); } };
    return [e, data];
  };
  const create = (source, data) => { const [e, d] = fakeEffect(source, data); Hooks.callAll("preCreateActiveEffect", e, d, {}, "gm"); return e; };
  game.time.worldTime = 1000;
  // v14: data already migrated, source with Foundry's start stamped.
  let e14 = create({ name: "Mage Armour", duration: { value: 3600, units: "seconds", expiry: "turnStart", expired: false }, start: { time: 1000, combat: null, round: null, turn: null } });
  assert.equal(e14.flags.arneyan?.endsAt, 4600, "v14 create: endsAt");
  // v14: the raw { seconds: 3600 } a module passes, source migrated.
  let e14raw = create({ name: "Raw", duration: { value: 3600, units: "seconds", expiry: "turnStart", expired: false }, start: { time: 1000 } }, { name: "Raw", duration: { seconds: 3600 } });
  assert.equal(e14raw.flags.arneyan?.endsAt, 4600, "v14 create from v13-shaped data");
  // v14: rounds in Foundry's config.
  const e14r = create({ name: "Hold", duration: { value: 5, units: "rounds", expiry: "turnStart", expired: false }, start: { time: 1000 } });
  assert.equal(e14r.flags.arneyan?.endsAt, 1030);
  // v13 as before.
  const e13 = create({ name: "Old", duration: { seconds: 600, rounds: null, startTime: null } });
  assert.equal(e13.flags.arneyan?.endsAt, 1600, "v13 create: endsAt");
  // No duration: none.
  const none = create({ name: "Prone", duration: { value: null, units: "seconds", expiry: null, expired: false }, start: { time: 1000 } });
  assert.equal(none.flags.arneyan?.endsAt, undefined);
  // Junk never throws out of the hook.
  const warn = console.warn; console.warn = () => {};
  try {
    assert.doesNotThrow(() => Hooks.callAll("preCreateActiveEffect", { _source: null, updateSource() { throw new Error("x"); } }, { duration: { value: 3, units: "hours" } }, {}, "gm"));
    assert.doesNotThrow(() => Hooks.callAll("preCreateActiveEffect", null, {}, {}, "gm"));
    assert.doesNotThrow(() => Hooks.callAll("preUpdateActiveEffect", null, { duration: { value: 3 } }, {}, "gm"));
    assert.doesNotThrow(() => Hooks.callAll("preUpdateActiveEffect", { _source: { duration: "junk" } }, { duration: "junk" }, {}, "gm"));
  } finally { console.warn = warn; }

  // Expiry with the clock.
  game.users = Object.assign([{ id: "gm", isGM: true }], { activeGM: { isSelf: true } });
  const actorEffects = [e14, e14r, e13, none];
  assert.deepEqual(T.expiredEffects({ effects: { contents: actorEffects } }, 1030).map(e => e.name), ["Hold"]);
  assert.deepEqual(T.expiredEffects({ effects: { contents: actorEffects } }, 4600).map(e => e.name), ["Mage Armour", "Hold", "Old"]);

  // Time left on the sheet (worldtime's label and the actor sheet's Effects list).
  assert.equal(T.timeLeftLabel(e14, 1000), "1 h left");
  assert.equal(T.timeLeftLabel(e14r, 1000), "5 rounds left");
  const { CharacterData } = await import("../arneyan/module/data/actor-models.mjs");
  const { ArneyanActorSheet } = await import("../arneyan/module/sheets.mjs");
  for (const e of actorEffects) { e.statuses = new Set(); e.img = "x.svg"; e.disabled = false; }
  const holder = makeActor(CharacterData, "character", {}, [], actorEffects);
  const ctx = await sheetContext(ArneyanActorSheet, holder, { _activeTab: "effects" });
  const label = n => ctx.effects.find(x => x.name === n)?.duration;
  assert.equal(label("Mage Armour"), "1 h left", "sheet: v14 seconds");
  assert.equal(label("Hold"), "5 rounds left", "sheet: v14 rounds");
  assert.equal(label("Old"), "10 min left", "sheet: v13 seconds");
  // Combat rounds left still come from flags.arneyan.expires, whatever the shape.
  game.combats = new Map([["c9", { id: "c9", started: true, round: 3, turn: 0 }]]);
  e14r.flags.arneyan.expires = { combat: "c9", round: 5, turn: 0 };
  const ctx2 = await sheetContext(ArneyanActorSheet, holder, { _activeTab: "effects" });
  assert.equal(ctx2.effects.find(x => x.name === "Hold").duration, "2 rounds left");
  game.combats = new Map();

  /* ---------------- Editing the duration later (preUpdate) ---------------- */
  const update = (effect, changes) => { Hooks.callAll("preUpdateActiveEffect", effect, changes, {}, "gm"); return changes; };
  game.time.worldTime = 2000;
  // v14 config: 1 hour to 2 hours, counted from the effect's start.
  let ch = update(e14, { duration: { value: 7200, units: "seconds", expiry: "turnStart" } });
  assert.equal(ch.flags?.arneyan?.endsAt, 8200, "v14 edit: from start.time");
  // Only the value sent (units kept from the source).
  ch = update(e14, { duration: { value: 2 } });
  assert.equal(ch.flags?.arneyan?.endsAt, 1002);
  // Units changed: 3600 seconds to 3600 minutes.
  ch = update(e14, { duration: { units: "minutes" } });
  assert.equal(ch.flags?.arneyan?.endsAt, 1000 + 3600 * 60);
  // The same length saved again: left alone.
  ch = update(e14, { duration: { value: 3600, units: "seconds", expiry: "turnStart", expired: false } });
  assert.equal(ch.flags?.arneyan?.endsAt, undefined, "unchanged: left alone");
  // Cleared: no end.
  ch = update(e14, { duration: { value: null } });
  assert.equal(ch.flags?.arneyan?.endsAt, null, "cleared");
  // An effect made with no duration and given one later: from now (v14 start.time 0 is not a start).
  const late = fakeEffect({ name: "Late", duration: { value: null, units: "seconds", expiry: null }, start: { time: 0 } })[0];
  ch = update(late, { duration: { value: 60, units: "seconds" } });
  assert.equal(ch.flags?.arneyan?.endsAt, 2060);
  // v14 effect, a module's v13-shaped change.
  ch = update(e14, { duration: { rounds: 5 } });
  assert.equal(ch.flags?.arneyan?.endsAt, 1030);
  // v13 as before.
  const old13 = fakeEffect({ name: "Old13", duration: { seconds: 60, rounds: null, startTime: 100 } })[0];
  ch = update(old13, { duration: { seconds: 120 } });
  assert.equal(ch.flags?.arneyan?.endsAt, 220);
  ch = update(old13, { duration: { seconds: null, rounds: 4 } });
  assert.equal(ch.flags?.arneyan?.endsAt, 124);
  ch = update(old13, { duration: { seconds: 60 } });
  assert.equal(ch.flags?.arneyan?.endsAt, undefined);
  // An update that sets endsAt itself, or does not touch the duration, is left alone.
  ch = update(e14, { duration: { value: 10 }, flags: { arneyan: { endsAt: 5 } } });
  assert.equal(ch.flags.arneyan.endsAt, 5);
  ch = update(e14, { name: "Renamed" });
  assert.equal(ch.flags, undefined);
  // The pure helper agrees.
  assert.equal(T.endsAtAfterUpdate(e14, { duration: { value: 2, units: "hours" } }, 0, 6), 1000 + 7200);
  assert.equal(T.endsAtAfterUpdate(e14, {}, 0, 6), undefined);
} finally {
  Object.assign(globalThis, saved);
  Object.assign(game, savedGame);
  foundry.utils.hasProperty = savedHas; foundry.utils.mergeObject = savedMerge;
}
console.log("OK v14dur");

// R-F50 (K213, K221): turn checks. The turn log, the rage check, and the attack card's notes from the turn.
import assert from "node:assert/strict";
import "./harness.mjs";
const T = await import("../arneyan/module/turns.mjs");

/* The log: a tick per turn; what each combatant did on its last turn; attacks and damage by tick. */
let { log, ended } = T.startTurn(T.emptyLog(), "a");
assert.equal(log.tick, 1); assert.equal(log.cur, "a"); assert.equal(ended, null);
assert.equal(log.log.a.start, 1); assert.equal(log.log.a.acted, true);
log = T.noteMove(log, "a", 15);
log = T.noteMove(log, "b", 30);                         // not b's turn: not counted
assert.equal(log.log.a.moved, 15); assert.equal(log.log.b, undefined);
log = T.noteAttack(log, "a");
({ log, ended } = T.startTurn(log, "b"));
assert.deepEqual(ended.last, { moved: 15, attacked: true });
assert.equal(ended.end, 2); assert.equal(log.log.b.start, 2); assert.equal(log.log.b.moved, 0);
// b stands still and doesn't attack; a takes damage on b's turn.
log = T.noteHurt(log, "a");
({ log, ended } = T.startTurn(log, "a"));
assert.deepEqual(ended.last, { moved: 0, attacked: false });
assert.equal(log.log.a.moved, 0, "a new turn starts its count again");
assert.equal(log.log.a.last.attacked, true, "a's last turn kept until this one ends");
// The same combatant again (a turn change that changes nothing) leaves the log as it was.
const again = T.startTurn(log, "a");
assert.equal(again.ended, null);
// ...unless it is a new round with it alone in the fight.
const alone = T.startTurn(log, "a", { again: true });
assert.ok(alone.ended); assert.equal(alone.log.log.a.start, log.tick + 1);

/* Rage ends at the end of a turn with no attack made and no damage taken since the last turn ended. */
assert.equal(T.rageIdle({ prevEnd: 4, attackT: 3, hurtT: -1 }), true, "the last attack was before the last turn ended");
assert.equal(T.rageIdle({ prevEnd: 4, attackT: 5, hurtT: -1 }), false, "attacked since");
assert.equal(T.rageIdle({ prevEnd: 4, attackT: -1, hurtT: 4 }), false, "took damage since (on the next creature's turn)");
assert.equal(T.rageIdle({ prevEnd: null, attackT: -1, hurtT: -1 }), true, "first turn, nothing done");
assert.equal(T.rageIdle({ prevEnd: null, attackT: 1, hurtT: -1 }), false, "first turn, attacked");
{
  // Played through: a rages and attacks on turn 1, then idles on turn 3.
  let l = T.startTurn(T.emptyLog(), "a").log;
  l = T.noteAttack(l, "a");
  let r = T.startTurn(l, "b"); assert.equal(T.rageIdle(r.ended), false);
  r = T.startTurn(r.log, "a");
  r = T.startTurn(r.log, "b"); assert.equal(T.rageIdle(r.ended), true, "no attack and no damage on its next turn");
  // Damage on b's turn keeps it going through a's next idle turn.
  let h = T.noteHurt(r.log, "a");
  h = T.startTurn(h, "a"); h = T.startTurn(h.log, "b");
  assert.equal(T.rageIdle(h.ended), false);
}

/* Movement: displacement (a teleport, the GM's drag) doesn't count. */
assert.equal(T.movementFeet({ passed: { distance: 20, waypoints: [{ action: "walk" }] } }), 20);
assert.equal(T.movementFeet({ passed: { distance: 20, waypoints: [{ action: "displace" }] } }), 0);
assert.equal(T.movementFeet({}), 0);

/* HP lost in an update (the actor's _preUpdate keeps what it had). */
assert.equal(T.hurtBy({ id: "x" }, { system: { attributes: { hp: { value: 7 } } } }, { arneyanPrevHp: { x: 10 }, arneyanPrevTemp: { x: 0 } }), 3);
assert.equal(T.hurtBy({ id: "x" }, { system: { attributes: { hp: { temp: 2 } } } }, { arneyanPrevHp: { x: 10 }, arneyanPrevTemp: { x: 5 } }), 3);
assert.equal(T.hurtBy({ id: "x" }, { system: { attributes: { hp: { value: 12 } } } }, { arneyanPrevHp: { x: 10 } }), 0, "healing isn't damage");

/* Who can't see whom, and the marks a creature's own feature leaves. */
const fx = (...s) => ({ effects: s.map(x => ({ statuses: [x] })) });
assert.equal(T.cannotSee(fx("blinded"), fx()), "it can't see you");
assert.equal(T.cannotSee(fx(), fx("invisible")), "you are Invisible");
assert.equal(T.cannotSee(fx(), fx()), "");
const me = { uuid: "Actor.me" };
const studied = { effects: [{ name: "Studied", origin: "Actor.me.Item.s" }] };
assert.equal(T.markedBy(studied, me, "Studied"), true);
assert.equal(T.markedBy(studied, { uuid: "Actor.other" }, "Studied"), false);

/* Exploit's and Sneak Attack's openings without a map: statuses, and (Assassin) the Studied mark. */
assert.deepEqual(T.openings(me, fx("prone"), {}), ["it is Prone"]);
assert.deepEqual(T.openings(me, fx("restrained", "blinded"), {}), ["it can't see you", "it is Restrained"]);
assert.deepEqual(T.openings(me, { effects: [{ name: "Studied", origin: "Actor.me.Item.s" }] }, { assassin: true }), ["it is your Studied target"]);
assert.deepEqual(T.openings(me, fx("prone"), { assassin: true }), [], "Prone is no Sneak Attack opening");

/* The attack card outside a fight: nothing from the turn. */
globalThis.game.combats = { contents: [] };
const archer = { type: "character", items: [{ type: "ability", name: "Running Shot" }], getActiveTokens: () => [] };
const bow = { type: "weapon", name: "Bow, Long", system: { ranged: true } };
assert.deepEqual(await T.turnHints(archer, bow, []), { maybe: [], notes: [] });

/* In a fight, on its own turn: Running Shot, Dead Eye and Dead Aim from the log. */
{
  const actor = { id: "pc", type: "character", uuid: "Actor.pc", getActiveTokens: () => [],
    items: ["Running Shot", "Dead Eye", "Dead Aim"].map(name => ({ type: "ability", name })) };
  let l = T.startTurn(T.emptyLog(), "c1").log;
  l = T.noteMove(l, "c1", 15);
  const combatant = { id: "c1", actor, actorId: "pc" };
  const combat = { id: "k", started: true, round: 1, turn: 0, combatant, combatants: [combatant], turns: [combatant], getFlag: () => l };
  globalThis.game.combats = { contents: [combat] };
  let h = await T.turnHints(actor, bow, []);
  assert.ok(h.maybe.some(([d, w]) => d === 1 && /Running Shot \(you moved 15ft/.test(w)), JSON.stringify(h));
  assert.ok(h.notes.some(n => /Dead Eye: no benefit: you have moved 15ft/.test(n)));
  assert.ok(h.notes.some(n => /Dead Aim: no last turn on record/.test(n)));
  // Next turn: it stood still and didn't attack, so Dead Aim applies and Dead Eye too; Running Shot waits for a move.
  l = T.startTurn(l, "c2").log; l = T.startTurn(l, "c1").log;
  // Its turn before this one: it moved 15ft, so Dead Aim doesn't apply yet.
  h = await T.turnHints(actor, bow, []);
  assert.ok(h.notes.some(n => /Dead Aim doesn't apply: last turn you moved/.test(n)));
  assert.ok(h.notes.some(n => /Dead Eye applies/.test(n)));
  assert.ok(h.notes.some(n => /Running Shot: no Advantage yet: you have moved 0ft/.test(n)));
  l = T.startTurn(l, "c2").log; l = T.startTurn(l, "c1").log;
  h = await T.turnHints(actor, bow, []);
  assert.ok(h.maybe.some(([d, w]) => d === 1 && /^Dead Aim/.test(w)), JSON.stringify(h));
  // Never Still (Archer 10th): any distance counts.
  actor.items.push({ type: "ability", name: "Never Still" });
  l = T.noteMove(l, "c1", 5);
  h = await T.turnHints(actor, bow, []);
  assert.ok(h.maybe.some(([, w]) => /Running Shot \(you moved 5ft/.test(w)));
  // Not its turn (an attack out of turn): nothing from this turn.
  combat.combatant = { id: "c2" };
  h = await T.turnHints(actor, bow, []);
  assert.equal(h.maybe.length, 0);
  // A melee weapon: no ranged hints.
  combat.combatant = combatant;
  h = await T.turnHints(actor, { type: "weapon", name: "Dagger", system: { ranged: false } }, []);
  assert.ok(!h.notes.some(n => /Dead/.test(n)));
}

/* Has a creature acted yet this encounter? */
{
  const a = { id: "a" }, b = { id: "b" };
  const ca = { id: "ca", actor: a, actorId: "a" }, cb = { id: "cb", actor: b, actorId: "b" };
  const l = T.startTurn(T.emptyLog(), "ca").log;
  globalThis.game.combats = { contents: [{ id: "k", started: true, round: 1, turn: 0, combatant: ca, combatants: [ca, cb], turns: [ca, cb], getFlag: () => l }] };
  assert.equal(T.hasActed(a), true);
  assert.equal(T.hasActed(b), false);
  globalThis.game.combats = { contents: [{ id: "k", started: true, round: 2, turn: 0, combatant: ca, combatants: [ca, cb], turns: [ca, cb], getFlag: () => null }] };
  assert.equal(T.hasActed(b), true, "no log: round 2, everyone has acted");
}
globalThis.game.combats = undefined;

console.log("turns: ok");

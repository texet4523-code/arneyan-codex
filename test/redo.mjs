// Advantage and Disadvantage after the roll on every d20 (Kieran, 9 Nov 2026), with what the roll decided worked out
// again: contests, Luck Checks, initiative, Last Chance, firearms. Runs on its own.
import assert from "node:assert/strict";
import "./harness.mjs";

for (const k of ["Item", "Combatant"]) globalThis[k] ??= class {};
globalThis.Actor ??= class {};
const chat = [];
globalThis.ChatMessage = { create: async m => { const d = { ...m, id: `m${chat.length}` }; chat.push(d); return d; }, getSpeaker: () => ({}), getSpeakerActor: () => null };
globalThis.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };
globalThis.Hooks = { on: () => {}, once: () => {}, callAll: () => {} };
const settings = { advMode: "manual" };
game.settings = { get: (s, k) => settings[k] ?? "publicroll", register: () => {} };
foundry.applications.handlebars = { renderTemplate: async (p, ctx) => JSON.stringify({ canSecond: ctx.canSecond, secondAdv: ctx.secondAdv, secondDis: ctx.secondDis, outcomeLabel: ctx.outcomeLabel }) };
let naturals = [];
globalThis.Roll = class {
  constructor(f) { this.formula = f; }
  async evaluate() {
    const two = /^2d20/.test(this.formula);
    const rs = two ? [naturals.shift(), naturals.shift()] : [naturals.shift()];
    const kept = /kh/.test(this.formula) ? Math.max(...rs) : /kl/.test(this.formula) ? Math.min(...rs) : rs.reduce((t, x) => t + x, 0);
    const bonus = Number(this.formula.match(/\+\s*(\d+)/)?.[1] ?? 0);
    this.dice = [{ faces: 20, total: kept, modifiers: /kh/.test(this.formula) ? ["kh"] : /kl/.test(this.formula) ? ["kl"] : [], results: rs.map(r => ({ result: r, active: r === kept })) }];
    this.total = kept + bonus;
    return this;
  }
};

const R = await import("../arneyan/module/rolls.mjs");
const C = await import("../arneyan/module/combat.mjs");
const D = await import("../arneyan/module/documents.mjs");
const X = await import("../arneyan/module/redo.mjs");

/* Buttons on contests and on rolls that work their Advantage out themselves. */
{
  naturals = [12];
  const msg = await R.d20Roll({ actor: null, kind: "contest", title: "Grapple", parts: [{ label: "Str", value: 2 }], why: { adv: [], dis: [], auto: true } });
  assert.equal(JSON.parse(msg.content).canSecond, true, "a contest card has the buttons");
  assert.deepEqual(msg.flags.arneyan.dice, [12], "and keeps its dice for them");
  naturals = [7, 15];
  const auto = await R.d20Roll({ actor: null, kind: "save", mode: 1, title: "Last Chance", why: { adv: ["Rule"], dis: [], auto: true }, extra: { lastChance: true } });
  const card = JSON.parse(auto.content);
  assert.ok(card.canSecond && card.secondDis && !card.secondAdv, "an automatic roll with Advantage: the other button cancels it");
  naturals = [10];
  const cancelled = await R.d20Roll({ actor: null, kind: "contest", title: "Break free", why: { adv: ["Small"], dis: ["Rule"], auto: true } });
  assert.equal(JSON.parse(cancelled.content).canSecond, false, "the rules' own Advantage and Disadvantage cancelled: no button overrules that");
  naturals = [9];
  const none = await R.d20Roll({ actor: null, kind: "check", title: "Downtime", extra: { noSecond: true } });
  assert.equal(JSON.parse(none.content).canSecond, false, "a downtime check chooses before rolling, so none");
}

/* Luck Checks: roll-under, Advantage keeps the lower die. */
assert.deepEqual(R.luckOutcome(1, 3), { success: true, outcome: "nat1luck", label: "Natural 1: fate smiles" });
assert.equal(R.luckOutcome(20, 25).success, false, "a natural 20 always fails");
assert.equal(R.luckOutcome(9, 9).success, true, "equal succeeds");
assert.equal(R.luckOutcome(10, 9).success, false);
assert.ok(R.SECOND_KINDS.includes("contest"));

/* Initiative: the dice of the roll and the die kept. */
{
  naturals = [6, 14];
  const r = await new Roll("2d20kh + 3").evaluate();
  assert.deepEqual(X.initiativeDice(r), { mode: 1, dice: [6, 14], natural: 14, total: 17 });
  naturals = [11];
  const one = await new Roll("1d20 + 2").evaluate();
  assert.deepEqual(X.initiativeDice(one), { mode: 0, dice: [11], natural: 11, total: 13 });
  assert.equal(X.initiativeDice({ dice: [{ faces: 6 }] }), null, "not a d20");
  assert.equal(X.keptAfter(8, 15, 1), 15, "Advantage keeps the higher");
  assert.equal(X.keptAfter(8, 15, -1), 8, "Disadvantage the lower");
  assert.equal(X.keptAfter(14, 0, -1, { cancel: true, first: 6 }), 6, "cancelling goes back to the first die");
}

/* Last Chance. */
assert.equal(D.lastChanceOk({ natural: 20, total: 18 }), true, "a natural 20 always stabilises");
assert.equal(D.lastChanceOk({ natural: 1, total: 14 }), false, "a natural 1 never does");
assert.equal(D.lastChanceOk({ natural: 8, total: 10 }), true);
assert.equal(D.lastChanceOk({ natural: 8, total: 9, luckBurned: 1 }), true, "Luck burned on the card counts");
assert.equal(D.lastChanceOk({ natural: 12, total: 12, autoFail: true }), false);

/* Firearms: the misfire from the die kept. */
{
  const fire = { threshold: 2, reliable: false, silent: false, reload: "1 rd" };
  assert.equal(C.misfireResult(fire, 2).jam, true);
  assert.equal(C.misfireResult(fire, 14).jam, false, "Advantage past the threshold: no misfire");
  assert.match(C.misfireHtml({ name: "Pistol" }, fire, 2, C.misfireResult(fire, 2)), /Pistol jams.*Natural 2/);
}

/* A contest worked out again: a grapple lost on the first roll, won after Advantage, and lost again. */
{
  class FakeActor extends Actor {
    constructor(name) {
      super();
      this.name = name; this.uuid = `Actor.${name}`; this.isOwner = true; this.flags = {};
      const list = []; list.has = id => list.some(e => e.id === id); this.effects = list;
    }
    async createEmbeddedDocuments(t, data) { const made = data.map((d, i) => ({ ...d, id: d._id ?? `${this.name}e${this.effects.length + i}`, statuses: new Set(d.statuses ?? []), toObject() { return { ...d, _id: this.id }; } })); this.effects.push(...made); return made; }
    async deleteEmbeddedDocuments(t, ids) { for (const id of ids) { const i = this.effects.findIndex(e => e.id === id); if (i >= 0) this.effects.splice(i, 1); } }
    async setFlag(s, k, v) { this.flags[s] ??= {}; this.flags[s][k] = v; }
  }
  Object.setPrototypeOf(FakeActor, Actor);
  const att = new FakeActor("Brute"), tgt = new FakeActor("Goblin");
  globalThis.fromUuid = async u => ({ [att.uuid]: att, [tgt.uuid]: tgt }[u] ?? null);
  const msg = (id, total, natural) => ({ id, flags: { arneyan: { kind: "contest", total, natural } } });
  const am = msg("a", 14, 12), dm = msg("d", 16, 14);
  const result = {
    id: "r", flags: { arneyan: { contestResult: { kind: "grapple", attackerUuid: att.uuid, targetUuid: tgt.uuid, attMsg: "a", defMsg: "d", attAb: "str", defAb: "str", combat: "", won: false, done: null } } },
    canUserModify: () => true,
    async update(u) { this.content = u.content; this.flags.arneyan.contestResult = u["flags.arneyan.contestResult"]; }
  };
  globalThis.game.messages = new Map([["a", am], ["d", dm], ["r", result]]);
  assert.equal(await C.contestRedoHere(result), true, "the owner of both works it out here");
  // Advantage on the attacker's card: 19 + 2 beats 16.
  am.flags.arneyan.total = 21;
  assert.equal(await C.redoContest(result), true);
  assert.equal(tgt.effects.length, 1, "the grapple goes on");
  assert.ok(tgt.effects[0].statuses.has("restrained"));
  assert.match(result.content, /Grapple: success/);
  assert.match(result.content, /worked out again/i);
  // Two at once (the player's button through the GM, the GM's own): one after the other, the win applied once.
  am.flags.arneyan.total = 30;
  dm.flags.arneyan.total = 16;
  result.flags.arneyan.contestResult = { ...result.flags.arneyan.contestResult, won: false, done: null };
  for (const e of [...tgt.effects]) tgt.effects.splice(tgt.effects.indexOf(e), 1);
  await Promise.all([C.redoContest(result), C.redoContest(result)]);
  assert.equal(tgt.effects.length, 1, "one grapple, not two");
  am.flags.arneyan.total = 21;
  // Advantage on the defender's card: 21 against 21, and a tie goes to the defender.
  dm.flags.arneyan.total = 21;
  assert.equal(await C.redoContest(result), false, "a tie goes to the defender");
  assert.equal(tgt.effects.length, 0, "the grapple comes off again");
  assert.match(result.content, /a tie goes to the defender/);
  // Break free: won, then lost on a second die (the grapple comes back).
  const held = new FakeActor("Hero"), grappler = new FakeActor("Ogre");
  globalThis.fromUuid = async u => ({ [held.uuid]: held, [grappler.uuid]: grappler }[u] ?? null);
  await held.createEmbeddedDocuments("ActiveEffect", [{ name: "Grappled by Ogre", statuses: ["restrained"], flags: { arneyan: { grappledBy: grappler.uuid } } }]);
  const e1 = msg("a2", 18, 15), e2 = msg("d2", 12, 9);
  const res2 = { ...result, id: "r2", flags: { arneyan: { contestResult: { kind: "escape", attackerUuid: held.uuid, targetUuid: grappler.uuid, attMsg: "a2", defMsg: "d2", attAb: "str", defAb: "str", combat: "", won: false, done: null } } } };
  game.messages.set("a2", e1); game.messages.set("d2", e2);
  assert.equal(await C.redoContest(res2), true);
  assert.equal(held.effects.length, 0, "breaks free");
  e1.flags.arneyan.total = 10;
  assert.equal(await C.redoContest(res2), false);
  assert.equal(held.effects.length, 1, "held again: the grapple is back");
  assert.equal(held.effects[0].flags.arneyan.grappledBy, grappler.uuid);
}
/* Any other d20 in chat (a typed roll, an inline roll, a table draw). */
{
  naturals = [7];
  const r = await new Roll("1d20 + 4").evaluate();
  const msg = { id: "q", flags: {}, rolls: [r], getFlag: () => null, whisper: [], async update(u) { this.flags.arneyan = { anyD20: u["flags.arneyan.anyD20"] }; } };
  assert.deepEqual(X.d20Of(msg), { roll: r, die: r.dice[0], mode: 0, dice: [7], natural: 7 });
  game.messages.set("q", msg);
  naturals = [15];
  assert.equal(await X.anyD20SecondDie(msg, 1), 19, "Advantage keeps the 15: 15 + 4");
  assert.match(msg.flags.arneyan.anyD20.note, /second d20 15, so the total is 19/);
  assert.equal(await X.anyD20SecondDie(msg, -1), undefined, "once only");
  naturals = [3, 18];
  const adv = await new Roll("2d20kh").evaluate();
  const m2 = { id: "q2", flags: {}, rolls: [adv], getFlag: () => null, whisper: [], async update(u) { this.flags.arneyan = { anyD20: u["flags.arneyan.anyD20"] }; } };
  game.messages.set("q2", m2);
  assert.equal(await X.anyD20SecondDie(m2, 1), undefined, "already Advantage: no second Advantage");
  assert.equal(await X.anyD20SecondDie(m2, -1), 3, "Disadvantage cancels it: the first die counts");
  naturals = [4, 5];
  assert.equal(X.d20Of({ rolls: [await new Roll("2d20").evaluate()] }), null, "two d20s added together aren't a d20 roll");
}
console.log("OK redo");

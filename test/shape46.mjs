// 0.10.46: changing shape turns the creature's own token into the form (no hidden copy left behind), and back.
import assert from "node:assert/strict";
import "./harness.mjs";
for (const k of ["Item", "Combatant"]) globalThis[k] ??= class {};
globalThis.game ??= {};
game.time = { worldTime: 0 };
const deep = o => JSON.parse(JSON.stringify(o));
const getP = (o, path) => path.split(".").reduce((x, k) => x?.[k], o);
const setP = (o, path, v) => { const ks = path.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k] ??= {}; x[ks.at(-1)] = v; };

function makeToken(scene, data) {
  const t = { ...deep(data), parent: scene, flags: deep(data.flags ?? {}) };
  t.toObject = () => { const { parent, toObject, update, getFlag, ...rest } = t; return deep(rest); };
  t.getFlag = (s, k) => t.flags?.[s]?.[k];
  t.update = async (u) => {
    for (const [k, v] of Object.entries(u)) {
      if (k.includes(".-=")) { const [head, tail] = k.split(".-="); const obj = getP(t, head); if (obj) delete obj[tail]; }
      else if (k.includes(".")) setP(t, k, deep(v));
      else t[k] = deep(v);
    }
    return t;
  };
  return t;
}
const scene = { id: "S1", tokens: [] };
scene.tokens.has = id => scene.tokens.some(t => t.id === id);
scene.deleteEmbeddedDocuments = async (_, ids) => { for (const id of ids) scene.tokens.splice(scene.tokens.findIndex(t => t.id === id), 1); };
const actors = [];
game.actors = Object.assign(actors, { get: id => actors.find(a => a.id === id) });
game.scenes = { contents: [scene], [Symbol.iterator]: function* () { yield scene; } };
const combatant = { sceneId: "S1", tokenId: "T1", actorId: "A1", update: async u => Object.assign(combatant, u) };
game.combats = [{ combatants: [combatant] }];
game.folders = { find: () => ({ id: "F1" }) };
game.users = { activeGM: { isSelf: true } };
globalThis.ChatMessage = { create: async () => ({}), getSpeaker: () => ({}) };
let made = 0;
function makeActor(data) {
  const a = { ...deep(data), flags: deep(data.flags ?? {}) };
  a.uuid = `Actor.${a.id}`;
  a.getFlag = (s, k) => a.flags?.[s]?.[k];
  a.toObject = () => { const { toObject, getFlag, delete: _d, update, effects, prototypeToken, token, items, isToken, ...rest } = a; return { ...deep(rest), items: [], prototypeToken: deep(data.prototypeToken ?? {}), effects: [] }; };
  a.effects = { contents: [] };
  a.prototypeToken = { toObject: () => deep(a._proto ?? data.prototypeToken ?? {}) };
  a.delete = async () => actors.splice(actors.indexOf(a), 1);
  a.update = async () => a;
  return a;
}
globalThis.Actor = class { static async create(data) { const a = makeActor({ ...data, id: `C${++made}` }); a._proto = data.prototypeToken; actors.push(a); return a; } };
globalThis.fromUuid = async uuid => actors.find(a => a.uuid === uuid) ?? null;

const ilsa = makeActor({ id: "A1", name: "Ilsa", type: "character", img: "ilsa.png", system: { attributes: { hp: { value: 31 } }, abilities: {} }, items: [], ownership: { default: 0 }, prototypeToken: { name: "Ilsa", texture: { src: "ilsa-token.png" } } });
actors.push(ilsa);
const tok = makeToken(scene, { id: "T1", name: "Ilsa", actorId: "A1", actorLink: true, x: 300, y: 200, texture: { src: "ilsa-token.png", scaleX: 1 }, width: 1, height: 1, sight: { enabled: true, range: 60 } });
scene.tokens.push(tok);
const wolf = makeActor({ id: "W", name: "Wolf", type: "npc", img: "wolf.svg", system: { attributes: { hp: { value: 11 } }, abilities: {} }, items: [], prototypeToken: { texture: { src: "wolf-token.svg" }, width: 1, height: 1, sight: { enabled: true, range: 0 } } });
wolf.uuid = "Compendium.arneyan.monsters.Actor.W";

const T = await import("../arneyan/module/transform.mjs");
const { actor: form } = await T.doTransform(ilsa, wolf, { keepMind: true });
assert.equal(scene.tokens.length, 1, "no second token: the creature's own token is the form");
assert.equal(tok.actorId, form.id);
assert.equal(tok.actorLink, true);
assert.equal(tok.texture.src, "wolf-token.svg");
assert.equal(tok.x, 300, "where it stands");
assert.ok(!tok.hidden, "nothing hidden");
assert.equal(tok.flags.arneyan.shapeBefore.actorId, "A1");
assert.equal(combatant.actorId, form.id, "its place in the combat tracker stays, now the form");
assert.ok(T.isChanged(ilsa));
// The form moves (it's the same token); turning back keeps the place.
tok.x = 700;
await T.doRevert(form);
assert.equal(scene.tokens.length, 1);
assert.equal(tok.actorId, "A1");
assert.equal(tok.texture.src, "ilsa-token.png");
assert.equal(tok.sight.range, 60);
assert.equal(tok.x, 700, "back where the form stood");
assert.ok(!tok.flags.arneyan.shapeBefore, "nothing left over");
assert.equal(combatant.actorId, "A1");
assert.ok(!actors.includes(form), "the form's actor goes");

// An unlinked monster's own changes (its delta) come back with it.
const before = T.tokenBefore(makeToken(scene, { id: "T2", name: "Goblin", actorId: "G", actorLink: false, texture: { src: "g.png" }, width: 1, height: 1, sight: {}, delta: { system: { attributes: { hp: { value: 3 } } } } }));
assert.deepEqual(T.tokenFromForm(before).delta, { system: { attributes: { hp: { value: 3 } } } });
assert.equal(T.tokenFromForm(before).actorLink, false);
assert.equal(T.tokenToForm({ texture: { src: "w.svg" }, width: 2, height: 2 }, "C9").actorLink, true);
// An unlinked monster druid: the Wild Shape use is spent on its own sheet before its token's changes are kept, so
// it stays spent when it returns; its uuid finding the form while switched doesn't confuse the return.
const order = [];
const scene2 = scene;
const gTok = makeToken(scene2, { id: "T9", name: "Briar", actorId: "B", actorLink: false, x: 50, y: 50, texture: { src: "briar.png" }, width: 1, height: 1, sight: {}, delta: { items: [] } });
const tokUpdate = gTok.update;
gTok.update = async u => { if ("actorId" in u) order.push(`token:${u.actorId}`); return tokUpdate(u); };
scene2.tokens.push(gTok);
const ws = { name: "Wild Shape", system: { uses: { value: 1, max: 1 } }, update: async u => { order.push("spend"); ws.system.uses.value = u["system.uses.value"]; } };
const briar = makeActor({ id: "B", name: "Briar", type: "npc", img: "b.png", system: { attributes: { hp: { value: 20 } }, abilities: {} }, items: [], ownership: {}, prototypeToken: {} });
briar.items = Object.assign([ws], { find: f => [ws].find(f) });
briar.isToken = true; briar.token = gTok; briar.uuid = "Scene.S1.Token.T9.Actor.B";
const r2 = await T.doTransform(briar, wolf, { keepMind: true, wildShape: true });
assert.deepEqual(order.slice(0, 2), ["spend", `token:${r2.actor.id}`], "the use is spent before the token is switched");
assert.equal(ws.system.uses.value, 0);
globalThis.fromUuid = async uuid => uuid === briar.uuid ? r2.actor : actors.find(a => a.uuid === uuid) ?? null;
const created = [];
scene2.createEmbeddedDocuments = async (_, docs) => { created.push(...docs); return docs; };
await T.doRevert(r2.actor);
assert.equal(gTok.actorId, "B");
assert.equal(gTok.actorLink, false);
assert.equal(created.length, 0, "no second Briar made");
console.log("OK shape 0.10.46");

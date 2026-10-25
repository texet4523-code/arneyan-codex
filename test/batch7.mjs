// Batch 7 (0.10.52): player feedback. Max HP drops take current HP with them; the donated sets list; who can move
// the party token; Starting Luck and gold typed in; the dialog buttons and the browser's purse line.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 } };
globalThis.Hooks ??= { on() {}, once() {}, callAll() {} };
foundry.utils.randomID ??= () => Math.random().toString(36).slice(2, 10);

/* ---------------- Max HP lowered: current HP follows, and stays ---------------- */
const CB = await import("../arneyan/module/combat.mjs");
{
  const gm = { id: "gm", isGM: true, isSelf: true };
  game.users = { activeGM: gm };
  game.user = { id: "gm", isGM: true, targets: new Set() };
  const updates = [];
  const actor = { type: "character", uuid: "Actor.a", system: { attributes: { hp: { value: 30, max: 20, effectiveMax: 20 } } },
    update: async (u, o) => { updates.push([u, o]); actor.system.attributes.hp.value = u["system.attributes.hp.value"]; } };
  assert.equal(CB.hpOverMax(actor), 20);
  CB.checkHpMax(actor, "player");
  CB.checkHpMax(actor, "player"); // twice in a row: one write
  await new Promise(r => setTimeout(r, 350));
  assert.deepEqual(updates.map(u => u[0]), [{ "system.attributes.hp.value": 20 }], "down to the new maximum, once");
  assert.equal(updates[0][1].arneyanHpClamp, true);
  // The maximum comes back: current HP stays where it was put.
  actor.system.attributes.hp.max = actor.system.attributes.hp.effectiveMax = 30;
  CB.checkHpMax(actor, "player");
  await new Promise(r => setTimeout(r, 350));
  assert.equal(updates.length, 1, "nothing written when the maximum rises");
  assert.equal(actor.system.attributes.hp.value, 20);
  // Another client with a GM on: it leaves the write to the GM.
  game.users = { activeGM: { id: "gm", isSelf: false } };
  game.user = { id: "p1", isGM: false, targets: new Set() };
  actor.system.attributes.hp.max = actor.system.attributes.hp.effectiveMax = 10;
  CB.checkHpMax(actor, "p1");
  await new Promise(r => setTimeout(r, 350));
  assert.equal(updates.length, 1, "only the active GM writes");
  // No GM on: whoever made the change writes it.
  game.users = { activeGM: null };
  CB.checkHpMax(actor, "p1");
  await new Promise(r => setTimeout(r, 350));
  assert.equal(updates.length, 2);
  assert.equal(actor.system.attributes.hp.value, 10);
  // Parties, storage and compendium entries are left alone.
  CB.checkHpMax({ ...actor, type: "party" }, "p1");
  CB.checkHpMax({ ...actor, pack: "x" }, "p1");
  await new Promise(r => setTimeout(r, 350));
  assert.equal(updates.length, 2);
  // HP typed in by hand above the maximum is kept until the maximum falls below what it was typed against.
  {
    game.users = { activeGM: { id: "gm", isSelf: true } };
    const ups = [];
    const npc = { type: "npc", uuid: "Actor.n", name: "Ogre", system: { attributes: { hp: { value: 30, max: 5, effectiveMax: 5 } } },
      update: async u => { ups.push(u); npc.system.attributes.hp.value = u["system.attributes.hp.value"]; } };
    assert.equal(CB.noteHandSetHp(npc, { system: { attributes: { hp: { value: 30 } } } }), true, "typed HP noted");
    CB.checkHpMax(npc, "gm"); // an AC edit, a condition removed...
    await new Promise(r => setTimeout(r, 350));
    assert.equal(ups.length, 0, "typed HP kept");
    npc.system.attributes.hp.max = npc.system.attributes.hp.effectiveMax = 4; // the maximum falls below it
    CB.checkHpMax(npc, "gm");
    await new Promise(r => setTimeout(r, 350));
    assert.deepEqual(ups, [{ "system.attributes.hp.value": 4 }], "then brought down");
    assert.equal(CB.noteHandSetHp(npc, { name: "x" }), false, "other changes aren't typed HP");
  }
  console.log("OK max HP lowered takes current HP down, and it stays");
}

/* ---------------- Rule B: the table's donated sets ---------------- */
const CG = await import("../arneyan/module/chargen.mjs");
{
  let stored = [];
  game.settings = { get: (s, k) => (k === "donatedSets" ? stored : "publicroll"), set: async (s, k, v) => { if (k === "donatedSets") stored = v; } };
  game.user = { id: "gm", isGM: true, targets: new Set() };
  globalThis.ChatMessage = { create: () => {}, getWhisperRecipients: () => [] };
  assert.equal(await CG.gmDonate([16, 15, 12, 10, 9, 8], "Tess"), true);
  assert.equal(await CG.gmDonate([12, 11, 10, 9, 8, 7], "Bad"), false, "a set below the Gygaxian Threshold isn't donated");
  assert.equal(await CG.gmDonate([19, 15, 14, 10, 9, 8], "Bad"), false, "nor one with a score above 18");
  assert.equal(CG.donatedSets().length, 1);
  assert.deepEqual(CG.donatedSets()[0].set, [16, 15, 12, 10, 9, 8]);
  assert.equal(CG.donatedSets()[0].from, "Tess");
  const id = CG.donatedSets()[0].id;
  assert.equal(await CG.gmTake(id, "Bran"), true);
  assert.equal(CG.donatedSets().length, 0, "taken off the list");
  assert.equal(await CG.gmTake(id, "Cass"), false, "it can't be taken twice");
  // Two arriving together both land (one change at a time).
  stored = [];
  game.settings.set = async (s, k, v) => { await new Promise(r => setTimeout(r, 10)); if (k === "donatedSets") stored = v; };
  await Promise.all([CG.gmDonate([16, 15, 12, 10, 9, 8], "A"), CG.gmDonate([15, 14, 12, 10, 9, 8], "B")]);
  assert.equal(CG.donatedSets().length, 2, "neither is lost");
  for (let i = 0; i < 25; i++) await CG.gmDonate([14, 14, 10, 10, 10, 10], `P${i}`);
  assert.equal(CG.donatedSets().length, 20, "the list keeps the latest 20");
  const src = fs.readFileSync(new URL("../arneyan/module/chargen.mjs", import.meta.url), "utf8");
  assert.ok(src.includes("arn-scores-donated") && src.includes('data-donated="${d.id}"'), "the scores window lists them");
  console.log("OK donated sets");
}

/* ---------------- Who can move the party token ---------------- */
const PT = await import("../arneyan/module/party.mjs");
{
  const users = [{ id: "gm", name: "GM", isGM: true }, { id: "p1", name: "Ann", isGM: false }, { id: "p2", name: "Ben", isGM: false }];
  game.users = Object.assign(users, { activeGM: users[0] });
  game.paused = true;
  const ownership = { default: 3, gm: 3, p2: 2 };
  const party = { id: "party", ownership, testUserPermission: u => (ownership[u.id] ?? ownership.default) >= 3,
    update: async u => { for (const [k, v] of Object.entries(u)) { if (k.startsWith("ownership.-=")) delete ownership[k.slice(12)]; else ownership[k.slice(10)] = v; } } };
  const scene = { tokens: [{ actorId: "party", actorLink: true, locked: true, hidden: false }] };
  const r = PT.partyControlReport(party, scene);
  assert.deepEqual(r.rows.map(x => [x.name, x.own]), [["Ann", true], ["Ben", false]]);
  assert.ok(r.rows[1].why.includes("beats the Default"), "an explicit lower level is named as the cause");
  assert.ok(r.issues.some(i => i.includes("locked")) && r.issues.some(i => i.includes("paused")));
  game.user = { id: "gm", isGM: true, targets: new Set() };
  await PT.letPlayersMoveParty(party);
  assert.equal(ownership.p2, 3, "the lower level is raised to Owner");
  assert.equal(PT.partyControlReport(party, scene).allOwn, true);
  const tpl = fs.readFileSync(new URL("../arneyan/templates/actor/party-sheet.hbs", import.meta.url), "utf8");
  assert.ok(tpl.includes('data-action="partyControl"'));
  game.paused = false;
  console.log("OK party token control");
}

/* ---------------- Starting gold typed in ---------------- */
{
  const ST = await import("../arneyan/module/starting.mjs");
  const src = fs.readFileSync(new URL("../arneyan/module/starting.mjs", import.meta.url), "utf8");
  assert.ok(src.includes('name="typed"') && src.includes('action: "typed"'), "starting gold: a box to type the roll into");
  assert.equal(typeof ST.packSlots, "function");
  const P = fs.readFileSync(new URL("../arneyan/module/progression.mjs", import.meta.url), "utf8");
  assert.ok(P.includes('name="luckHow" value="type" checked') && P.includes('value="roll"') && P.includes('value="later"'), "Starting Luck: type, roll or later");
  assert.ok(!P.includes('name="luck" checked'), "no auto-roll box");
  const css = fs.readFileSync(new URL("../arneyan/styles/arneyan.css", import.meta.url), "utf8");
  assert.ok(css.includes(".arneyan.application footer.form-footer button"), "dialog buttons styled");
  const br = fs.readFileSync(new URL("../arneyan/templates/apps/browser.hbs", import.meta.url), "utf8");
  assert.ok(br.includes("arn-br-purse"), "the browser shows the purse");
  console.log("OK typed rolls, buttons, purse");
}
console.log("All batch 7 checks passed.");

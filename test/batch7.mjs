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
  // Current HP can never be set above the maximum (Kieran, 25 Oct): held to it before saving.
  {
    for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
    const { capHpChange } = await import("../arneyan/module/documents.mjs");
    const npc = { type: "npc", _source: { system: { attributes: { hp: { max: 5 } } } }, system: { attributes: { hp: { value: 5, max: 7, effectiveMax: 7 } } } };
    let ch = { system: { attributes: { hp: { value: 30 } } } };
    capHpChange(npc, ch); assert.equal(ch.system.attributes.hp.value, 7, "typed above the maximum: held to it");
    ch = { system: { attributes: { hp: { value: 30, max: 20 } } } };
    capHpChange(npc, ch); assert.equal(ch.system.attributes.hp.value, 22, "with a new stored maximum (20 + 2 from rules)");
    ch = { system: { attributes: { hp: { max: 2 } } } };
    capHpChange(npc, ch); assert.equal(ch.system.attributes.hp.value, 4, "lowering the stored maximum brings current HP with it");
    ch = { system: { attributes: { hp: { value: 3 } } } };
    capHpChange(npc, ch); assert.equal(ch.system.attributes.hp.value, 3, "below the maximum: untouched");
  }
  console.log("OK max HP lowered takes current HP down, and it stays");
}

/* ---------------- Rule B: the table's donated sets, in a journal ---------------- */
const CG = await import("../arneyan/module/chargen.mjs");
{
  // A mock journal with one text page.
  const pageFlags = {};
  const page = { id: "pg", type: "text", text: { content: "" }, getFlag: (s, k) => pageFlags[k], update: async u => { await new Promise(r => setTimeout(r, 5)); if ("text.content" in u) page.text.content = u["text.content"]; if ("flags.arneyan.fromChat" in u) pageFlags.fromChat = u["flags.arneyan.fromChat"]; } };
  let journal = null;
  game.journal = { find: fn => (journal && fn(journal) ? journal : undefined) };
  globalThis.JournalEntry = { create: async d => { page.text.content = d.pages[0].text.content; journal = { name: d.name, ownership: d.ownership, flags: d.flags, getFlag: (s, k) => d.flags?.[s]?.[k], setFlag: async (s, k, v) => { d.flags[s][k] = v; }, pages: { contents: [page] } }; return journal; } };
  game.user = { id: "gm", isGM: true, targets: new Set() };
  game.users = { activeGM: { id: "gm", isSelf: true }, get: () => null };
  globalThis.ChatMessage = { create: () => {}, getWhisperRecipients: () => [] };
  assert.equal(await CG.gmDonate([16, 15, 12, 10, 9, 8], "Tess"), true);
  assert.equal(journal.name, "Donated Ability Score Sets", "the journal is made on first use");
  assert.equal(journal.ownership.default, 2, "players can read it");
  assert.ok(page.text.content.includes("<li>16, 15, 12, 10, 9, 8 (from Tess)</li>"));
  assert.equal(await CG.gmDonate([12, 11, 10, 9, 8, 7], "Bad"), false, "a set below the Gygaxian Threshold isn't donated");
  assert.equal(await CG.gmDonate([19, 15, 14, 10, 9, 8], "Bad"), false, "nor one with a score above 18");
  assert.deepEqual(CG.donatedSets().map(d => [d.set, d.from]), [[[16, 15, 12, 10, 9, 8], "Tess"]]);
  // The GM edits the page by hand: their own text stays, their lines count.
  page.text.content = "<p>My note: 14 is the line.</p><ul><li>16, 15, 12, 10, 9, 8 (from Tess)</li><li>17 14 13 12 11 10</li><li>not a set</li></ul>";
  assert.equal(CG.donatedSets().length, 2, "a line typed by hand counts");
  const id = CG.donatedSets()[0].id;
  assert.equal(await CG.gmTake(id, "Bran"), true);
  assert.deepEqual(CG.donatedSets().map(d => d.set), [[17, 14, 13, 12, 11, 10]], "taken off the list");
  assert.ok(page.text.content.startsWith("<p>My note: 14 is the line.</p>"), "the GM's own text stays");
  assert.equal(await CG.gmTake(id, "Cass"), false, "it can't be taken twice");
  // Two arriving together both land (one change at a time).
  await Promise.all([CG.gmDonate([16, 15, 12, 10, 9, 8], "A"), CG.gmDonate([15, 14, 12, 10, 9, 8], "B")]);
  assert.equal(CG.donatedSets().length, 3, "neither is lost");
  // A name can't break the list.
  await CG.gmDonate([14, 14, 10, 10, 10, 10], '<b>"x"</b>');
  assert.ok(!page.text.content.includes("<b>"), "names are escaped");
  // Struck-out lines don't count; names with apostrophes survive; sets typed as paragraphs move into the list.
  assert.equal(CG.parseDonated("<ul><li><s>16, 15, 12, 10, 9, 8</s></li><li>15, 15, 12, 10, 9, 8 (from D&#39;Arcy)</li></ul>").map(d => d.from).join(), "D'Arcy");
  assert.equal(CG.donatedHtml("<p>Intro</p><p>16, 15, 12, 10, 9, 8 (from A)</p>", CG.parseDonated("<p>16, 15, 12, 10, 9, 8 (from A)</p>")), "<p>Intro</p><ul><li>16, 15, 12, 10, 9, 8 (from A)</li></ul>");
  // A set typed as a paragraph beside the (empty) list counts, and leaves when taken; the GM's own lines stay.
  const typed = "<p>Intro</p><ul></ul><p>16, 15, 12, 10, 9, 8</p>";
  assert.equal(CG.parseDonated(typed).length, 1);
  assert.equal(CG.donatedHtml(typed, []), "<p>Intro</p><ul></ul>");
  assert.equal(CG.donatedHtml("<p>Intro<br>16, 15, 12, 10, 9, 8</p>", CG.parseDonated("<p>Intro<br>16, 15, 12, 10, 9, 8</p>")), "<p>Intro</p><ul><li>16, 15, 12, 10, 9, 8</li></ul>");
  assert.equal(CG.donatedHtml("<h2>Sets</h2><p>16, 15, 12, 10, 9, 8</p>", []), "<h2>Sets</h2><ul></ul>");
  // Donations in chat (Kieran: "pull from the chat"): the new flag and older cards' text both count, once each.
  page.text.content = "<p>Intro</p><ul></ul>";
  const old = Date.parse("2026-10-24T12:00:00Z");
  const msgs = [
    { id: "m1", timestamp: old, speaker: { alias: "Brunt" }, content: "<p>Brunt McHaggard kept Set Beta. Set Alpha (16, 16, 11, 9, 16, 9) can be donated to the table (Rule B).</p>", flags: {} },
    { id: "m2", timestamp: Date.parse("2026-11-01T00:00:00Z"), speaker: { alias: "Ann" }, content: "<p>...</p>", flags: { arneyan: { donation: { set: [15, 14, 13, 12, 10, 8], from: "Ann" } } } },
    { id: "m3", timestamp: old, speaker: { alias: "Test" }, content: "<p>Test: Method V Set Alpha: 13, 14, 14, 12, 14, 12</p>", flags: {} },
    { id: "m4", timestamp: old, speaker: { alias: "Cass" }, content: "<p>Cass kept Set Beta. Set Alpha (17, 15, 12, 10, 9, 8) goes on the table's donated sets.</p>", flags: {} },
    { id: "m5", timestamp: Date.parse("2026-11-01T00:00:00Z"), speaker: { alias: "Faker" }, content: "<p>Faker kept Set Beta. Set Alpha (18, 18, 18, 18, 18, 18) can be donated to the table (Rule B).</p>", flags: {} },
    { id: "m6", timestamp: Date.parse("2026-11-01T00:00:00Z"), whisper: ["gm"], speaker: { alias: "Ann" }, content: "", flags: { arneyan: { donation: { set: [16, 16, 16, 16, 16, 16], from: "Ann" } } } },
    { id: "m7", timestamp: Date.parse("2026-11-01T00:00:00Z"), author: { name: "Bob", isGM: false }, speaker: { alias: "Brunt", actor: "brunt" }, content: "", flags: { arneyan: { donation: { set: [16, 16, 16, 16, 16, 16], from: "Brunt" } } } }
  ];
  game.actors = { get: id => (id === "brunt" ? { testUserPermission: u => u.name === "Kieran" } : null) };
  const n1 = await CG.syncDonatedFromChat(msgs);
  assert.equal(n1, 1, "live: only the flagged public message from an owner");
  assert.equal(await CG.syncDonatedFromChat(msgs, { oldCards: true }), 1, "on load: the pre-0.10.53 card too; never 'goes on the table' (added already), a new typed sentence, a whisper or a non-owner");
  assert.deepEqual(CG.donatedSets().map(d => [d.set.join(","), d.from]), [["15,14,13,12,10,8", "Ann"], ["16,16,11,9,16,9", "Brunt"]]);
  await CG.gmTake(CG.donatedSets()[1].id, "Cass");
  assert.equal(await CG.syncDonatedFromChat(msgs, { oldCards: true }), 0, "a message already copied isn't copied again, so a taken set stays gone");
  assert.equal(CG.donatedSets().length, 1);
  // An old card whose set was already typed in by hand isn't listed twice.
  page.text.content = "<p>Intro</p><ul><li>14, 14, 10, 10, 10, 10</li></ul>";
  assert.equal(await CG.syncDonatedFromChat([{ id: "m8", timestamp: old, speaker: { alias: "Dee" }, content: "Dee kept Set Beta. Set Alpha (14, 14, 10, 10, 10, 10) can be donated to the table", flags: {} }], { oldCards: true }), 0);
  assert.equal(CG.donatedSets().length, 1);
  // Nobody can delete the journal.
  const src = fs.readFileSync(new URL("../arneyan/module/chargen.mjs", import.meta.url), "utf8");
  assert.ok(src.includes('Hooks.on("preDeleteJournalEntry"') && src.includes('Hooks.on("preDeleteJournalEntryPage"'));
  assert.ok(src.includes("arn-scores-donated") && src.includes('data-donated="${esc(d.id)}"'), "the scores window lists them");
  console.log("OK donated sets journal");
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

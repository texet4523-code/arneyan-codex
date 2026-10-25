// Batch 8 (Kieran, 25 Oct 2026): effects follow-up, feature buttons, firearm reloads, secret group rolls.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

globalThis.Hooks ??= { on() {}, once() {}, callAll() {} };
for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
const E = await import("../arneyan/module/effects.mjs");
const pack = name => { const dir = new URL(`../packs-src/${name}/`, import.meta.url).pathname; return fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(dir + f))); };

/* ---------------- 8.1 Options of the player's choice ---------------- */
{
  const em = pack("class-features").find(d => d.name === "Elemental Mastery").system;
  assert.equal(em.optionChoice.options.length, 6);
  assert.deepEqual(E.chosenRules(em), [], "nothing until the element is picked");
  const picked = { ...em, optionChoice: { ...em.optionChoice, value: ["Cold"] } };
  assert.deepEqual(E.chosenRules(picked).map(r => [r.key, r.value]), [["immune", "cold"]]);
  const inv = pack("class-features").find(d => d.name === "Eldritch Invocations").system;
  const three = { ...inv, optionChoice: { ...inv.optionChoice, value: ["Devil's Sight", "Agonising Blast", "Armour of Shadows"] } };
  assert.equal(E.optionPickMax(inv, 4), 1); assert.equal(E.optionPickMax(inv, 9), 3); assert.equal(E.optionPickMax(inv, 17), 5);
  assert.deepEqual(E.optionPicks(three, 4), ["Devil's Sight"], "only one counts at 4th");
  assert.equal(E.optionPicks(three, 9).length, 3);
  assert.ok(E.chosenRules(three, 9).some(r => r.key === "sense" && /Devil's Sight 60ft/.test(r.value)));
  // A pick the compendium no longer has doesn't count.
  assert.deepEqual(E.optionPicks({ ...inv, optionChoice: { ...inv.optionChoice, value: ["Gone"] } }), []);
  // Through the real path: an item with no rules of its own but options picked counts (review, Batch 8).
  const cls = { type: "class", name: "Warlock", system: { levels: 9 } };
  const invItem = { type: "ability", name: "Eldritch Invocations", system: { ...three, className: "Warlock" } };
  const emItem = { type: "ability", name: "Elemental Mastery", system: { ...picked, className: "Warlock" } };
  assert.equal(E.itemRulesActive(invItem), true);
  assert.equal(E.itemRulesActive({ ...invItem, system: inv }), false, "nothing picked: nothing to apply");
  const rules = E.collectRules({ items: Object.assign([cls, invItem, emItem], { find: Array.prototype.find }), effects: [], system: { level: 9 } }, { level: 9 });
  assert.ok(rules.some(r => r.key === "immune" && r.value === "cold"), "Elemental Mastery's pick applies");
  assert.ok(rules.some(r => r.key === "sense" && /Devil's Sight/.test(r.value)), "an invocation applies");
  const docs = fs.readFileSync(new URL("../arneyan/module/documents.mjs", import.meta.url), "utf8");
  assert.ok(docs.includes("optionDialogs.has(item.uuid)") && docs.includes('"option", { atLevelEnd: true }'), "one option question at a time; a level up asks at its end");
  const models = fs.readFileSync(new URL("../arneyan/module/data/actor-models.mjs", import.meta.url), "utf8");
  assert.ok(models.includes("i.system.needsOption = optionPicks(i.system).length < max"), "Choose shows while the level allows another pick");
  const { refreshFrom } = await import("../arneyan/module/migrate.mjs");
  assert.ok(typeof refreshFrom === "function");
  console.log("OK option choices (Elemental Mastery, Eldritch Invocations)");
}

/* ---------------- 8.1 Expanded Mind, Shifter, Turn Undead ---------------- */
{
  const em = pack("feats").find(d => d.name === "Expanded Mind").system;
  assert.deepEqual(em.rules.map(r => r.key), ["slots.highest"]);
  const ARNEYAN = (await import("../arneyan/module/config.mjs")).ARNEYAN;
  assert.ok(ARNEYAN.allRuleKeys.has("slots.highest"));
  const models = fs.readFileSync(new URL("../arneyan/module/data/actor-models.mjs", import.meta.url), "utf8");
  assert.ok(models.includes('mods.sum("slots.highest")'));
  const sh = pack("ancestries").find(d => d.name === "Shifter").system;
  assert.equal(sh.toggle, false); assert.deepEqual(sh.rules, []);
  const swift = sh.choice.options.find(o => o.name.endsWith("Swiftstride"));
  assert.equal(swift.toggle, true); assert.equal(swift.uses.formula, "max(1, ceil(@level/2))");
  assert.deepEqual(swift.rules.map(r => [r.key, r.value]), [["speed", "15"]]);
  assert.ok(sh.choice.options.find(o => o.name.endsWith("Beasthide")).rules.some(r => r.value === "non-magical 3"));
  // Turned comes off when its turner attacks it.
  const CB = await import("../arneyan/module/combat.mjs");
  const deleted = [];
  const turner = { uuid: "Actor.cleric", name: "Cleric" };
  const zombie = { name: "Zombie", effects: [{ id: "e1", statuses: new Set(["turned"]), flags: { arneyan: { casterUuid: "Actor.cleric" } } }, { id: "e2", statuses: new Set(["turned"]), flags: { arneyan: { casterUuid: "Actor.other" } } }],
    deleteEmbeddedDocuments: async (t, ids) => deleted.push(...ids) };
  game.users = { activeGM: { isSelf: true } };
  globalThis.fromUuidSync = u => (u === "Actor.zombie" ? zombie : null);
  globalThis.ChatMessage = { getSpeakerActor: () => turner, getSpeaker: () => ({}), create: async () => {} };
  assert.equal(await CB.endTurnedOnAttack({ speaker: {}, flags: { arneyan: { kind: "attack", targets: [{ uuid: "Actor.zombie" }] } } }), 1);
  assert.deepEqual(deleted, ["e1"], "only the Turned this attacker gave");
  assert.equal(await CB.endTurnedOnAttack({ speaker: {}, flags: { arneyan: { kind: "check" } } }), 0);
  console.log("OK Expanded Mind, Shifter, Turn Undead");
}
/* ---------------- 8.3 Firearm reloads ---------------- */
{
  const R = await import("../arneyan/module/reload.mjs");
  globalThis.ChatMessage = { getSpeaker: () => ({}), create: async () => {}, getSpeakerActor: () => null };
  const gun = (name, desc, traits = "", actorItems = []) => {
    const it = { type: "weapon", name, isOwner: true, flags: {}, system: { description: `<p>${desc}</p>`, traits },
      setFlag: async (s, k, v) => { it.flags[s] = { ...(it.flags[s] ?? {}), [k]: v }; } };
    it.actor = { name: "Gunner", id: "g1", items: [it, ...actorItems] };
    return it;
  };
  const musket = gun("Musket", "Reload 2 rd, misfire on 1-2.");
  assert.equal(R.isReloadable(musket), true);
  assert.deepEqual([R.capacityOf(musket), R.listedRounds(musket), R.reloadRounds(musket)], [1, 2, 2]);
  assert.equal(R.loadedOf(musket), 1, "loaded until fired");
  await R.spendShot(musket);
  assert.equal(R.loadedOf(musket), 0);
  game.combats = { find: () => ({ started: true, combatant: { actorId: "g1" }, combatants: [{ actorId: "g1" }] }) }; // in a fight, on the gunner's turn
  await R.startReload(musket);
  assert.deepEqual(R.ammoOf(musket), { loaded: 0, capacity: 1, reloading: 2 }, "this turn's action and the next");
  await R.advanceReloads(musket.actor);
  assert.deepEqual(R.ammoOf(musket), { loaded: 0, capacity: 1, reloading: 1 }, "the next turn's action goes on it: can't fire yet");
  await R.advanceReloads(musket.actor);
  assert.deepEqual(R.ammoOf(musket), { loaded: 1, capacity: 1, reloading: 0 }, "ready at the turn after");
  // A 1-round reload in a fight: fires next turn, not this one.
  const flint = gun("Flintlock Pistol", "Reload 1 rd, misfire on 1-2.", "Light");
  await R.spendShot(flint); await R.startReload(flint);
  assert.deepEqual(R.ammoOf(flint), { loaded: 0, capacity: 1, reloading: 1 });
  await R.advanceReloads(flint.actor);
  assert.equal(R.loadedOf(flint), 1);
  // The same turn sent again (initiative rolled mid-fight) spends nothing; a step back doesn't either.
  const rl = fs.readFileSync(new URL("../arneyan/module/reload.mjs", import.meta.url), "utf8");
  assert.ok(rl.includes("options?.direction === -1") && rl.includes("seen.has(key)") && rl.includes('Hooks.on("deleteCombat"'));
  assert.equal(R.turnKey({ round: 3, combatant: { id: "c1" } }), "3:c1");
  // Started on someone else's turn: their own next turn's action is the first.
  const other = gun("Pistol", "Reload 1 rd, misfire on 1-2.", "Light");
  other.actor.uuid = "Actor.g1";
  game.combats = { find: fn => { const c = { started: true, combatant: { actor: { uuid: "Actor.zz" }, actorId: "zz" }, combatants: [{ actor: { uuid: "Actor.g1" }, actorId: "g1" }] }; return fn(c) ? c : null; } };
  await R.spendShot(other); await R.startReload(other);
  assert.equal(R.ammoOf(other).reloading, 2);
  // A sheet opened from the sidebar (base actor) with an unlinked token in the fight still counts as fighting.
  game.combats = { find: fn => { const c = { started: true, combatant: null, combatants: [{ actor: { uuid: "Scene.s.Token.t.Actor.g1" }, actorId: "g1" }] }; return fn(c) ? c : null; } };
  assert.equal(R.inFight(other.actor), true);
  game.combats = { find: () => null };
  // Out of a fight: at once.
  game.combats = { find: () => null };
  await R.spendShot(musket); await R.startReload(musket);
  assert.equal(R.loadedOf(musket), 1);
  // Several shots; Quick Reload; Lightning Reload; heavy crossbow; Paired Pistols.
  const rep = gun("Repeating Pistol", "Reload 4 rd (full), misfire on 1.", "Light, 5 shots per reload");
  assert.equal(R.capacityOf(rep), 5); await R.spendShot(rep); assert.equal(R.loadedOf(rep), 4);
  const carbine = gun("Flintlock Carbine", "Reload 1 rd, misfire on 1-2.", "Quick Reload");
  assert.equal(R.reloadRounds(carbine), 0); await R.spendShot(carbine); assert.equal(R.loadedOf(carbine), 1, "reloads as part of the attack");
  const pistol = gun("Pistol", "Reload 1 rd, misfire on 1-2.", "Light", [{ name: "Lightning Reload" }]);
  assert.equal(R.reloadRounds(pistol), 0, "Lightning Reload: one round faster");
  const rifle = gun("Rifle", "Reload 3 rd, misfire on 1.", "", [{ name: "Lightning Reload" }]);
  assert.equal(R.reloadRounds(rifle), 2);
  const xbow = { type: "weapon", name: "Crossbow, Heavy", system: { description: "", traits: "Armour Piercing" }, flags: {} };
  assert.equal(R.isReloadable(xbow), true); assert.equal(R.reloadRounds(xbow), 1);
  assert.equal(R.isReloadable({ type: "weapon", name: "Crossbow, Light", system: { description: "", traits: "" }, flags: {} }), false);
  const paired = gun("Paired Pistols", "Reload 1 rd ea., misfire on 1-2.", "Light; fired as dual wielding");
  assert.equal(R.capacityOf(paired), 2);
  await R.spendShot(paired); await R.spendShot(paired);
  assert.equal(R.reloadRounds(paired), 2, "one round each");
  const cb = fs.readFileSync(new URL("../arneyan/module/combat.mjs", import.meta.url), "utf8");
  assert.ok(cb.includes("loadedReady(item)") && cb.includes("spendShot(item)"));
  assert.ok(cb.includes('setFlag(SYS, "ammo", { loaded: 0, reloading: 0 })'), "a misfire empties the gun: clear it, then a normal reload");
  console.log("OK firearm reloads");
}
/* ---------------- 8.4 Secret group rolls ---------------- */
{
  const G = await import("../arneyan/module/gmtools.mjs");
  const data = { kind: "skill", key: "Perception", dc: 15, label: "Spot the ambush", secret: true, members: [
    { uuid: "a", name: "Ann", img: "", mode: 0, rollId: "r1", total: 17, pass: true, outcome: "success" },
    { uuid: "b", name: "Ben", img: "", mode: 0, rollId: "", total: null, pass: null } ] };
  const html = G.partyRollHtml(data);
  assert.ok(!html.includes("<strong>17</strong>") && !html.includes("passed") && html.includes("rolled (secret") && html.includes("Secret"), "the public card holds no result");
  const gmView = G.partyRollHtml(data, { gm: true });
  assert.ok(gmView.includes("<strong>17</strong>") && gmView.includes("1 passed"), "the GM's view shows it");
  const open = G.partyRollHtml({ ...data, secret: false });
  assert.ok(open.includes("<strong>17</strong>") && !open.includes("rolled (secret"));
  // The GM's view reads secret results from the roll messages (the card's flags hold only the roll id).
  const bare = { ...data, members: [{ ...data.members[0], total: null, pass: null, outcome: "" }, data.members[1]] };
  const filled = G.filledMembers(bare, id => (id === "r1" ? { flags: { arneyan: { kind: "skill", total: 12, natural: 9 } } } : null));
  assert.deepEqual([filled[0].total, filled[0].pass], [12, false]);
  assert.equal(filled[1].total, null);
  const gone = G.filledMembers(bare, () => null);
  assert.ok(G.partyRollHtml({ ...bare, members: gone }, { gm: true }).includes("roll message was deleted"), "a deleted roll shows ?, not null");
  const src = fs.readFileSync(new URL("../arneyan/module/gmtools.mjs", import.meta.url), "utf8");
  assert.ok(src.includes('req.secret ? "blindroll"') && src.includes('name="secret"'));
  const rolls = fs.readFileSync(new URL("../arneyan/module/rolls.mjs", import.meta.url), "utf8");
  assert.ok(rolls.includes('rollMode: rollMode || game.settings.get("core", "rollMode")'));
  console.log("OK secret group rolls");
}
console.log("All batch 8 checks passed.");

/* ---------------- TAC tests 25 Oct: party tokens linked; unidentified rows ---------------- */
{
  const src = fs.readFileSync(new URL("../arneyan/module/arneyan.mjs", import.meta.url), "utf8");
  assert.ok(src.includes('if (!["character", "party"].includes(actor.type)) return;'), "a new party's token is linked, so travel counts on the party");
  const { hiddenFromPlayer } = await import("../arneyan/module/expand.mjs");
  assert.equal(hiddenFromPlayer({ system: { identified: false } }, false), true);
  assert.equal(hiddenFromPlayer({ system: { identified: false } }, true), false, "the GM sees it all");
  assert.equal(hiddenFromPlayer({ system: { identified: true } }, false), false);
  for (const f of ["storage.mjs", "party.mjs"]) assert.ok(fs.readFileSync(new URL(`../arneyan/module/${f}`, import.meta.url), "utf8").includes("hiddenFromPlayer("), `${f}: no price for unidentified gear`);
  const { publicName } = await import("../arneyan/module/expand.mjs");
  assert.equal(publicName({ type: "equipment", name: "Wand of Fireball", system: { identified: false, unidentifiedName: "Carved stick" } }), "Carved stick");
  assert.equal(publicName({ type: "weapon", name: "Flame Tongue", system: { identified: false } }), "Unidentified weapon");
  assert.equal(publicName({ type: "weapon", name: "Longsword", system: { identified: true } }), "Longsword");
  const sheets = fs.readFileSync(new URL("../arneyan/module/sheets.mjs", import.meta.url), "utf8");
  assert.ok(sheets.includes("price: hide ? \"\" : (s.price ?? \"\"),") && sheets.includes("!hiddenFromPlayer(i) && (i.system.itemSpells"), "gear rows and the wands list hide unidentified gear");
  assert.ok(fs.readFileSync(new URL("../arneyan/templates/actor/gear-row.hbs", import.meta.url), "utf8").includes('<span class="arn-muted">{{price}}</span>'));
  const travel = fs.readFileSync(new URL("../arneyan/module/travel.mjs", import.meta.url), "utf8");
  assert.ok(travel.includes("tokenDoc.actorLink ? tokenDoc.actor : (game.actors.get(tokenDoc.actorId) ?? tokenDoc.actor)"), "an unlinked party token counts on the party");
  console.log("OK linked party tokens, unidentified rows");
}

/**
 * The Arneyan Codex: game system for Foundry Virtual Tabletop (v13 and v14).
 */
import { ARNEYAN } from "./config.mjs";
import { CharacterData, NpcData, PartyData, StorageData } from "./data/actor-models.mjs";
import * as ItemModels from "./data/item-models.mjs";
import { ArneyanActor, ArneyanItem, ArneyanCombatant } from "./documents.mjs";
import { ArneyanActorSheet, ArneyanItemSheet, ArneyanTextEditor } from "./sheets.mjs";
import { ArneyanPartySheet, registerParty, activeParty, gatherParty, deployParty } from "./party.mjs";
import { openPdf } from "./rolls.mjs";
import { registerChat, registerConditions } from "./chat.mjs";
import * as Effects from "./effects.mjs";
import { ArneyanBrowser } from "./browser.mjs";
import { registerPanel } from "./panel.mjs";
import { registerEncounters, ArneyanEncounterBuilder, encounterBudget } from "./encounter.mjs";
import { registerTokens, visionTokenClass } from "./tokens.mjs";
import { registerProtection } from "./protect.mjs";
import { registerStorage, ArneyanStorageSheet } from "./storage.mjs";
import { registerMigration } from "./migrate.mjs";
import { openForge } from "./forge.mjs";
import { registerGear } from "./gear.mjs";
import { registerAreas } from "./areas.mjs";
import { registerAuras } from "./auras.mjs";
import { registerQol, useItem, combatClass, healthLabel } from "./qol.mjs";
import { registerChargen, abilityScores } from "./chargen.mjs";
import { registerCounters, drawTokenCounters } from "./counters.mjs";
import { registerTransform, transformInto, revertTransform } from "./transform.mjs";
import { registerCombat } from "./combat.mjs";
import { registerStealth } from "./stealth.mjs";
import { registerReload } from "./reload.mjs";
import { registerIntegrations } from "./integrations.mjs";
import { registerGmTools } from "./gmtools.mjs";
import { registerWorld } from "./world.mjs";
import { registerArt } from "./art.mjs";
import { registerImport, importDialog } from "./import.mjs";
import { registerMaps, ArneyanMapBrowser } from "./maps.mjs";
import { configureCalendar, registerCalendar, ArneyanCalendar } from "./calendar.mjs";
import { registerInitiative } from "./initiative.mjs";
import { registerLimits } from "./limits.mjs";

const SYS = "arneyan";

Hooks.once("init", () => {
  console.log("Arneyan | Initialising The Arneyan Codex");
  CONFIG.ARNEYAN = ARNEYAN;
  // The Tobiasian Calendar is the world's calendar (before Foundry builds game.time).
  configureCalendar();
  game.arneyan = { ARNEYAN, openPdf, forge: openForge, transform: transformInto, revert: revertTransform, effects: Effects, browser: opts => ArneyanBrowser.open(opts), ArneyanTextEditor, party: { active: activeParty, gather: gatherParty, deploy: deployParty }, encounter: () => ArneyanEncounterBuilder.open(), encounterBudget };

  // Documents and data models.
  CONFIG.Actor.documentClass = ArneyanActor;
  CONFIG.Item.documentClass = ArneyanItem;
  CONFIG.Combatant.documentClass = ArneyanCombatant;
  CONFIG.Combat.documentClass = combatClass(CONFIG.Combat.documentClass);
  CONFIG.Token.documentClass = visionTokenClass(CONFIG.Token.documentClass);
  CONFIG.Actor.dataModels = { character: CharacterData, npc: NpcData, party: PartyData, storage: StorageData };
  CONFIG.Item.dataModels = {
    class: ItemModels.ClassData,
    ancestry: ItemModels.AncestryData,
    kit: ItemModels.KitData,
    feat: ItemModels.FeatData,
    skill: ItemModels.SkillData,
    ability: ItemModels.AbilityData,
    weapon: ItemModels.WeaponData,
    armour: ItemModels.ArmourData,
    equipment: ItemModels.EquipmentData,
    spell: ItemModels.SpellData
  };

  // Initiative: d20 + Dexterity (+ rules), kept for the whole fight. The combatant class adds Advantage.
  CONFIG.Combat.initiative = { formula: "1d20 + @abilities.dex.mod", decimals: 2 };

  // Conditions, chat buttons, inline links, socket.
  registerConditions();
  registerChat();
  registerPanel();
  registerParty();
  registerEncounters();
  registerTokens();
  registerProtection();
  registerStorage();
  registerMigration();
  registerTransform();
  registerGear();
  registerAreas();
  registerAuras();
  registerQol();
  registerChargen();
  registerCounters();
  registerCombat();
  registerStealth();
  registerReload();
  registerIntegrations();
  registerGmTools();
  registerWorld();
  registerArt();
  registerImport();
  registerMaps();
  registerCalendar();
  registerInitiative();
  registerLimits();
  Object.assign(game.arneyan, { useItem, abilityScores, importActor: actor => importDialog(actor ?? null), calendar: () => ArneyanCalendar.open(), maps: () => ArneyanMapBrowser.open() });

  // Alt + right-click a token to target or untarget it (keeps other targets).
  const BaseToken = CONFIG.Token.objectClass;
  const altHeld = event => event?.altKey ?? event?.nativeEvent?.altKey ?? event?.data?.originalEvent?.altKey ?? game.keyboard?.isModifierActive?.("Alt");
  class ArneyanToken extends BaseToken {
    // Players may Alt + right-click tokens they don't own (normally only owners get right-clicks).
    _canHUD(user, event) {
      if (altHeld(event) && !this.layer?._draggedToken && this.document.disposition !== CONST.TOKEN_DISPOSITIONS?.SECRET) return true;
      return super._canHUD(user, event);
    }
    // Hovering a monster: how hurt it looks (players), or its HP and AC with that word under them (GM), under the elevation in the tooltip.
    _getTooltipText() {
      const base = super._getTooltipText?.() ?? "";
      let extra = "";
      try { extra = healthLabel(this); } catch { /* only a convenience */ }
      return extra ? (base ? `${base}\n${extra}` : extra) : base;
    }
    // Numbered conditions (Burning 2, Slowed 3) show their number on the icon.
    async _drawEffects(...args) {
      const r = await super._drawEffects(...args);
      try { drawTokenCounters(this); } catch (err) { console.warn("Arneyan | counters", err); }
      return r;
    }
    _onClickRight(event) {
      if (altHeld(event) && typeof this.setTarget === "function") {
        event?.stopPropagation?.();
        this.setTarget(!this.isTargeted, { releaseOthers: false });
        return;
      }
      return super._onClickRight(event);
    }
  }
  CONFIG.Token.objectClass = ArneyanToken;

  // Token bars.
  CONFIG.Actor.trackableAttributes = {
    character: { bar: ["attributes.hp", "luck"], value: ["attributes.speed"] },
    npc: { bar: ["attributes.hp"], value: ["attributes.ac", "attributes.morale"] },
    party: { bar: [], value: [] },
    storage: { bar: [], value: [] }
  };

  // Sheets.
  const DSC = foundry.applications.apps.DocumentSheetConfig;
  DSC.registerSheet(Actor, SYS, ArneyanActorSheet, { types: ["character", "npc"], makeDefault: true, label: "Arneyan Sheet" });
  DSC.registerSheet(Actor, SYS, ArneyanPartySheet, { types: ["party"], makeDefault: true, label: "Arneyan Party Sheet" });
  DSC.registerSheet(Actor, SYS, ArneyanStorageSheet, { types: ["storage"], makeDefault: true, label: "Arneyan Storage Sheet" });
  DSC.registerSheet(Item, SYS, ArneyanItemSheet, { makeDefault: true, label: "Arneyan Item Sheet" });

  // Settings: handbook PDFs.
  const pdfSetting = (key, name, hint) => game.settings.register(SYS, key, {
    name, hint, scope: "world", config: true, type: String, default: "",
    filePicker: key.endsWith("Pdf") ? "any" : undefined
  });
  pdfSetting("phbPdf", "Player's Handbook PDF", "The handbook PDF. Page links open it at the right page in a new browser tab.");
  pdfSetting("mtPdf", "Monsters & Treasure PDF", "The Monsters & Treasure PDF, used by monster and item page links.");
  pdfSetting("phbJournal", "Player's Handbook journal (PDF Pager)", "Optional. If the PDF Pager module is active, the name of the journal entry holding the handbook PDF. Links then open inside Foundry.");
  pdfSetting("mtJournal", "Monsters & Treasure journal (PDF Pager)", "Optional. As above, for Monsters & Treasure.");
  game.settings.register(SYS, "migratedLinks", { scope: "world", config: false, type: Boolean, default: false });
  // Kieran, 28 Oct 2026: 1s on a Hit Die rolled for a level are rerolled, as an option the table can switch off.
  game.settings.register(SYS, "rerollHitDieOnes", {
    name: "Reroll 1s on Hit Dice", hint: "When a level's Hit Die is rolled (2nd to 10th level), a 1 is rolled again once (the second roll stands). Off: a 1 stands. 1st level is always the full Hit Die + Con.",
    scope: "world", config: true, type: Boolean, default: true
  });

  // Text enricher: @PHB[123] and @MT[45] become page links in any description or journal.
  CONFIG.TextEditor.enrichers.push({
    pattern: /@(PHB|MT)\[(\d+)\](?:\{([^}]+)\})?/g,
    enricher: async (match) => {
      const [, book, page, label] = match;
      const a = document.createElement("a");
      a.classList.add("arn-page-link");
      a.dataset.book = book.toLowerCase();
      a.dataset.page = page;
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-book-open";
      a.append(icon, " " + (label ?? `${book} p. ${page}`));
      return a;
    }
  });

  // Templates and partials.
  foundry.applications.handlebars.loadTemplates([
    "systems/arneyan/templates/actor/item-controls.hbs",
    "systems/arneyan/templates/actor/gear-row.hbs",
    "systems/arneyan/templates/actor/item-expand.hbs",
    "systems/arneyan/templates/actor/abilities-list.hbs",
    "systems/arneyan/templates/actor/alignment.hbs",
    "systems/arneyan/templates/chat/roll-card.hbs",
    "systems/arneyan/templates/chat/item-card.hbs",
    "systems/arneyan/templates/chat/damage-card.hbs",
    "systems/arneyan/templates/item/rules-editor.hbs",
    "systems/arneyan/templates/apps/browser.hbs",
    "systems/arneyan/templates/apps/encounter.hbs"
  ]);
});

/* Page links anywhere in the UI (journals, item cards, descriptions). */
Hooks.once("ready", () => {
  document.body.addEventListener("click", event => {
    const link = event.target.closest?.(".arn-page-link");
    if (!link) return;
    event.preventDefault();
    openPdf(link.dataset.book || "phb", link.dataset.page);
  });
});

/* A button for the Arneyan Browser at the top of the Compendium sidebar. */
Hooks.on("renderCompendiumDirectory", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".arn-open-browser")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "arn-open-browser";
  btn.innerHTML = '<i class="fa-solid fa-book-atlas"></i> Arneyan Browser (search and filter)';
  btn.addEventListener("click", () => {
    const actor = canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
    ArneyanBrowser.open({ actor });
  });
  (root.querySelector(".header-actions, .directory-header") ?? root).prepend(btn);
});

/* Player characters and the party: tokens are linked to the actor, so sheet changes always reach the token (and a
 * party's travel count, kept on the actor, follows its token's moves: T129, 25 Oct 2026). */
Hooks.on("preCreateActor", (actor, data) => {
  if (!["character", "party"].includes(actor.type)) return;
  // Only fill gaps: imported or duplicated characters keep the token settings they came with.
  const proto = data.prototypeToken ?? {};
  const upd = {};
  if (!("actorLink" in proto)) upd["prototypeToken.actorLink"] = true;
  if (!("disposition" in proto)) upd["prototypeToken.disposition"] = 1;
  if (!proto.sight || !("enabled" in proto.sight)) upd["prototypeToken.sight.enabled"] = true;
  if (Object.keys(upd).length) actor.updateSource(upd);
});

/** True when an unlinked token holds no changes of its own (linking it would lose nothing). */
function deltaIsEmpty(token) {
  const d = token.delta?.toObject?.() ?? {};
  delete d._id;
  const flat = foundry.utils.flattenObject(d);
  return Object.values(flat).every(v => v === null || v === undefined || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Object.keys(v).length));
}

Hooks.once("ready", async () => {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
  if (game.settings.get(SYS, "migratedLinks")) return;
  // Once per world: link every character's prototype token and the placed tokens that hold no token-only changes.
  const unlinked = game.actors.filter(a => a.type === "character" && !a.prototypeToken.actorLink);
  for (const a of unlinked) await a.update({ "prototypeToken.actorLink": true }).catch(err => console.warn("Arneyan |", err));
  let tokens = 0;
  let skipped = 0;
  for (const scene of game.scenes) {
    skipped += scene.tokens.filter(t => !t.actorLink && t.baseActor?.type === "character" && !deltaIsEmpty(t)).length;
    try {
      const updates = scene.tokens.filter(t => !t.actorLink && t.baseActor?.type === "character" && deltaIsEmpty(t))
        .map(t => ({ _id: t.id, actorLink: true }));
      if (updates.length) { await scene.updateEmbeddedDocuments("Token", updates); tokens += updates.length; }
    } catch (err) { console.warn(`Arneyan | Could not link tokens on ${scene.name}`, err); }
  }
  await game.settings.set(SYS, "migratedLinks", true);
  if (unlinked.length || tokens) ui.notifications.info(`Arneyan: linked ${unlinked.length} character${unlinked.length === 1 ? "" : "s"} and ${tokens} placed token${tokens === 1 ? "" : "s"} to their actors, so sheet changes reach the map.`);
  if (skipped) ui.notifications.warn(`Arneyan: ${skipped} placed character token${skipped === 1 ? " has" : "s have"} changes of its own and ${skipped === 1 ? "was" : "were"} left unlinked. Delete and drag the character back onto the scene to link it.`, { permanent: true });
});

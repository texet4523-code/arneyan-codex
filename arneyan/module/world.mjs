/**
 * Drop 4: time, companions and travel. One place that registers the parts and gives the sheets what they need:
 *   worldtime.mjs   effect durations on the world clock, and the GM's clock
 *   summons.mjs     summoning spells and Pact Summons
 *   companions.mjs  familiars, animal companions and mounts
 *   downtime.mjs    the Downtime log
 *   travel.mjs      the party sheet's Travel tab
 */
import { registerWorldTime, timeLeftLabel } from "./worldtime.mjs";
import { registerSummons, dismissSummon, summonSummary } from "./summons.mjs";
import { registerCompanions, companionContext, addCompanion, placeCompanion, releaseCompanion } from "./companions.mjs";
import { downtimeContext, newDowntime, deleteDowntime, editDowntime } from "./downtime.mjs";
import { travelContext, travelDay, refillWater, resetJourney, tableNames } from "./travel.mjs";

export { timeLeftLabel };

export function registerWorld() {
  registerWorldTime();
  registerSummons();
  registerCompanions();
  foundry.applications.handlebars.loadTemplates([
    "systems/arneyan/templates/actor/companions.hbs",
    "systems/arneyan/templates/actor/downtime-tab.hbs",
    "systems/arneyan/templates/actor/travel-tab.hbs"
  ]);
}

/* -------------------------------------------- */
/*  Character and NPC sheets                    */
/* -------------------------------------------- */

/** Extra context for the actor sheet: companions, the summon, the downtime log. Safe outside Foundry. */
export function worldSheetContext(actor) {
  const out = { ...companionContext(actor), summon: summonSummary(actor) };
  if (actor?.type === "character") Object.assign(out, downtimeContext(actor));
  return out;
}

const companionFrom = target => globalThis.game.actors.get(target.closest("[data-companion-id]")?.dataset.companionId);

/** Actions for the actor sheet (spread into its DEFAULT_OPTIONS.actions); `this` is the sheet. */
export const WORLD_SHEET_ACTIONS = {
  companionAdd() { return addCompanion(this.document); },
  companionOpen(event, target) { return companionFrom(target)?.sheet.render(true); },
  companionPlace(event, target) { return placeCompanion(companionFrom(target)); },
  companionRelease(event, target) { return releaseCompanion(companionFrom(target)); },
  companionMaster(event, target) { return globalThis.game.actors.get(target.dataset.masterId)?.sheet.render(true); },
  summonDismiss() { return dismissSummon(this.document); },
  downtimeNew() { return newDowntime(this.document); },
  downtimeDelete(event, target) { return deleteDowntime(this.document, target.closest("[data-entry-id]")?.dataset.entryId); },
  downtimeEdit(event, target) { return editDowntime(this.document, target.closest("[data-entry-id]")?.dataset.entryId); }
};

/** A creature dropped on the Companions box becomes a companion; returns true when it handled the drop. */
export function dropOnCompanions(sheet, event, actor) {
  if (!event?.target?.closest?.(".arn-companions") || sheet.document.type !== "character") return false;
  if (actor?.type !== "npc") { ui.notifications.warn("Drop a creature from the Bestiary."); return true; }
  addCompanion(sheet.document, { uuid: actor.uuid, name: actor.name });
  return true;
}

/* -------------------------------------------- */
/*  Party sheet                                 */
/* -------------------------------------------- */

export async function worldPartyContext(party, members) {
  const ctx = travelContext(party, members);
  ctx.travel.tables = globalThis.game?.packs ? await tableNames().catch(() => []) : [];
  return ctx;
}

export const WORLD_PARTY_ACTIONS = {
  async travelDay() { const { partyMembers } = await import("./party.mjs"); return travelDay(this.document, partyMembers()); },
  async travelRefill() { const { partyMembers } = await import("./party.mjs"); return refillWater(this.document, partyMembers()); },
  travelReset() { return resetJourney(this.document); }
};

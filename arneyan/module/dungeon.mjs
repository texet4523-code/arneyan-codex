/**
 * Dungeon Phases (Codex, Random Encounter Rules, v0.10.85; Kieran's K211 and K212).
 *
 * On the party's Travel tab: Enter a dungeon (by name; each dungeon is remembered) and Leave it. Inside, the Phase button
 * makes the Encounter Check at the start of each phase (a new level or section, about an hour of exploring, or a rest):
 * one d12 for each die the dungeon has, up to 4, rolled together, the highest counting. 1 to 10 nothing stirs; 11 an
 * encounter, not always a fight (a Reaction Check button); 12 a bad turn as the dungeon wakes (a button to advance its
 * threat, if the GM set one). The dungeon stirs: combat, noise or being spotted adds a die (the GM's + button, or the
 * card's), friendly encounters add nothing. Calming down: each full day away, by the game clock, removes one (counted
 * when the party comes back), and the GM's - button removes one for shutting down the cause. Nothing is resolved
 * automatically: each dungeon's own table comes from its adventure or the GM's notes.
 *
 * State on the party actor: flags.arneyan.dungeons = { <key>: { name, dice, steps, threat, leftAt } }, and
 * flags.arneyan.dungeonAt = the key of the dungeon the party is in (or null).
 */
import { DAY } from "./worldtime.mjs";

const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Most dice a dungeon's check can have (Codex: up to 4 dice in all). */
export const MAX_DICE = 4;
/** Most steps a threat track can have. */
export const MAX_STEPS = 12;

/** A dungeon's key from its name (lower case, letters and digits). */
export const dungeonKey = name => String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Clamp a dungeon's dice to 1 to 4. */
export const clampDice = n => Math.max(1, Math.min(MAX_DICE, Math.round(Number(n) || 1)));

/** Full days between two game times (seconds), never less than 0. */
export const daysAway = (leftAt, now) => (leftAt == null || !Number.isFinite(Number(leftAt)) ? 0 : Math.max(0, Math.floor((Number(now) - Number(leftAt)) / DAY)));

/** A dungeon's dice once it has calmed down: one off for each full day the party was away (never below 1). */
export const calmed = (rec, now) => clampDice((Number(rec?.dice) || 1) - daysAway(rec?.leftAt, now));

/** What a phase's highest die means (Codex). */
export function phaseResult(highest) {
  const h = Number(highest) || 0;
  if (h >= 12) return { id: "bad", label: "A bad turn", text: "The dungeon wakes: the alarm is raised, reinforcements move, a guardian stirs, a way closes, water rises, the lights fail, or the dungeon's own threat advances a step." };
  if (h === 11) return { id: "encounter", label: "An encounter", text: "Not always a fight: residents on the move (roll a Reaction Check), a friendly or wary NPC, a rival party, a prisoner, a clue." };
  return { id: "none", label: "Nothing stirs", text: "" };
}

/** The chance of an 11 or 12 with this many dice, as a whole percentage (one die 17%, two 31%, three 42%, four 52%). */
export const odds = dice => Math.round((1 - Math.pow(10 / 12, clampDice(dice))) * 100);

/** The party's dungeons: { key: record }. */
export const dungeonsOf = party => foundry.utils.deepClone(party?.flags?.[SYS]?.dungeons ?? {});

/** The dungeon the party is in, with its key, or null. */
export function currentDungeon(party) {
  const key = party?.flags?.[SYS]?.dungeonAt;
  const rec = key ? party.flags[SYS].dungeons?.[key] : null;
  return rec ? { key, ...rec } : null;
}

/** For the Travel tab: the dungeon the party is in (dice, odds, threat) and the ones it knows. */
export function dungeonContext(party, now = 0) {
  const cur = currentDungeon(party);
  const all = Object.entries(party?.flags?.[SYS]?.dungeons ?? {}).map(([key, r]) => ({ key, name: r.name, dice: calmed(r, now), away: daysAway(r.leftAt, now), current: key === cur?.key }));
  if (!cur) return { inside: false, known: all };
  const dice = clampDice(cur.dice);
  const steps = Math.max(0, Math.min(MAX_STEPS, Number(cur.steps) || 0));
  const threat = Math.max(0, Math.min(steps, Number(cur.threat) || 0));
  return {
    inside: true, key: cur.key, name: cur.name, dice, odds: odds(dice), atMax: dice >= MAX_DICE, atMin: dice <= 1,
    steps, threat, track: Array.from({ length: steps }, (_, i) => ({ n: i + 1, on: i < threat })), known: all
  };
}

/* -------------------------------------------- */
/*  Changes (the GM's)                          */
/* -------------------------------------------- */

const gmOnly = () => {
  if (game.user.isGM) return true;
  ui.notifications.warn("The GM keeps the dungeon's state.");
  return false;
};

/** Go into a dungeon by name: a new one starts at one die; one the party knows has calmed for each full day away. */
export async function enterDungeon(party, name) {
  if (!gmOnly()) return null;
  const key = dungeonKey(name);
  if (!key) return null;
  const all = dungeonsOf(party);
  const old = all[key];
  const now = game.time.worldTime;
  const rec = old ? { ...old, name: String(name).trim() || old.name, dice: calmed(old, now), leftAt: null } : { name: String(name).trim(), dice: 1, steps: 0, threat: 0, leftAt: null };
  const was = old ? clampDice(old.dice) : 1;
  await party.update({ [`flags.${SYS}.dungeons.${key}`]: rec, [`flags.${SYS}.dungeonAt`]: key });
  const away = old ? daysAway(old.leftAt, now) : 0;
  ui.notifications.info(old ? `Back in ${rec.name}: ${rec.dice} d12${rec.dice === 1 ? "" : "s"}${rec.dice < was ? ` (${was - rec.dice} fewer after ${away} day${away === 1 ? "" : "s"} away)` : ""}.` : `Into ${rec.name}: one d12 for each phase.`);
  return rec;
}

/** Leave the dungeon: the game time is noted, so each full day away calms it by one die. */
export async function leaveDungeon(party) {
  if (!gmOnly()) return;
  const cur = currentDungeon(party);
  if (!cur) return;
  await party.update({ [`flags.${SYS}.dungeons.${cur.key}.leftAt`]: game.time.worldTime, [`flags.${SYS}.dungeonAt`]: null });
  ui.notifications.info(`Left ${cur.name}: it calms by a die for each full day away.`);
}

/** The dungeon stirs (+1) or calms (-1): the GM's call (combat, noise, being spotted; shutting down the cause). */
export async function stirDungeon(party, delta) {
  if (!gmOnly()) return null;
  const cur = currentDungeon(party);
  if (!cur) return null;
  const dice = clampDice((Number(cur.dice) || 1) + Math.sign(Number(delta) || 0));
  if (dice !== cur.dice) await party.update({ [`flags.${SYS}.dungeons.${cur.key}.dice`]: dice });
  return dice;
}

/** The dungeon's own threat (optional): its number of steps, or a step on or back. */
export async function setThreat(party, { steps = null, delta = 0 } = {}) {
  if (!gmOnly()) return null;
  const cur = currentDungeon(party);
  if (!cur) return null;
  const s = steps === null ? Math.max(0, Number(cur.steps) || 0) : Math.max(0, Math.min(MAX_STEPS, Math.round(Number(steps) || 0)));
  const t = Math.max(0, Math.min(s, (Number(cur.threat) || 0) + Math.sign(Number(delta) || 0)));
  await party.update({ [`flags.${SYS}.dungeons.${cur.key}.steps`]: s, [`flags.${SYS}.dungeons.${cur.key}.threat`]: t });
  if (s && t >= s && delta > 0) ui.notifications.warn(`${cur.name}'s threat has reached its last step.`);
  return { steps: s, threat: t };
}

/* -------------------------------------------- */
/*  The phase's check                           */
/* -------------------------------------------- */

/** The phase card's text. */
export function phaseCardHtml({ name, dice, results, highest, steps = 0, threat = 0 }) {
  const r = phaseResult(highest);
  const faces = results.map(n => (n === highest ? `<strong>${n}</strong>` : `${n}`)).join(", ");
  const gm = [];
  if (r.id === "encounter") gm.push(`<button type="button" data-arn-dungeon="reaction"><i class="fa-solid fa-handshake"></i> Reaction Check</button>`);
  if (r.id === "bad" && steps) gm.push(`<button type="button" data-arn-dungeon="threat"><i class="fa-solid fa-hourglass-half"></i> Advance the threat (${threat}/${steps})</button>`);
  if (r.id !== "none") gm.push(`<button type="button" data-arn-dungeon="stir"><i class="fa-solid fa-volume-high"></i> The dungeon stirs (+1 die)</button>`);
  return `<div class="arn-card arn-dungeon-card"><header class="arn-card-title"><i class="fa-solid fa-dungeon"></i> <span>Dungeon phase: ${esc(name)}</span></header>
    <div class="arn-card-result"><span class="arn-total">${highest}</span><span class="arn-target"><strong>${r.label}</strong></span></div>
    ${r.text ? `<p>${r.text}</p>` : ""}
    <p class="arn-card-meta">${dice} d12${dice === 1 ? "" : "s"}, highest counts: ${faces}.</p>
    ${r.id === "encounter" ? `<p class="arn-muted">Use the dungeon's own encounter table. A combat, a loud noise or the party being spotted stirs the dungeon (+1 die); a friendly or peaceful encounter adds nothing.</p>` : ""}
    ${r.id === "bad" ? `<p class="arn-muted">If this brings a combat, a loud noise or the party being spotted, the dungeon stirs too (+1 die).</p>` : ""}
    ${gm.length ? `<div class="arn-card-buttons">${gm.join("")}</div>` : ""}</div>`;
}

/** Roll the phase's Encounter Check (anyone may: the designated player). Rolled in the open. */
export async function rollPhase(party) {
  const cur = currentDungeon(party);
  if (!cur) return ui.notifications.warn("The party isn't in a dungeon: the GM uses Enter a dungeon first.");
  const dice = clampDice(cur.dice);
  const roll = await new Roll(`${dice}d12`).evaluate();
  const results = roll.dice[0].results.map(x => x.result);
  const highest = Math.max(...results);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: party }), rolls: [roll], sound: CONFIG.sounds.dice,
    content: phaseCardHtml({ name: cur.name, dice, results, highest, steps: Number(cur.steps) || 0, threat: Number(cur.threat) || 0 }),
    flags: { [SYS]: { dungeonPhase: { party: party.id, key: cur.key, dice, results, highest, result: phaseResult(highest).id } } }
  }, { rollMode: CONST.DICE_ROLL_MODES.PUBLIC });
}

/** Sheet actions for the Travel tab (`this` is the party's sheet). */
export const DUNGEON_ACTIONS = {
  async dungeonEnter() {
    if (!gmOnly()) return;
    const party = this.document;
    const known = Object.values(dungeonsOf(party)).map(r => r.name);
    const name = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Enter a dungeon", icon: "fa-solid fa-dungeon" }, classes: ["arneyan", "arn-gm-dialog"], position: { width: 380 },
      content: `<div class="form-group"><label>Dungeon</label><input type="text" name="name" list="arn-dungeon-known" autofocus placeholder="Its name, new or known"></div>
        <datalist id="arn-dungeon-known">${known.map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>
        <p class="arn-help">A dungeon the party has been in before keeps its dice, less one for each full day away.</p>`,
      ok: { label: "Enter", callback: (ev, button) => button.form.elements.name.value },
      rejectClose: false
    }).catch(() => null);
    if (name?.trim()) return enterDungeon(party, name);
  },
  dungeonLeave() { return leaveDungeon(this.document); },
  dungeonPhase() { return rollPhase(this.document); },
  dungeonStir(event, target) { return stirDungeon(this.document, Number(target.dataset.delta) || 0); },
  dungeonThreat(event, target) { return setThreat(this.document, { delta: Number(target.dataset.delta) || 0 }); }
};

/** The card's GM buttons, and the threat's step count field on the tab. */
export function registerDungeon() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const st = message.flags?.[SYS]?.dungeonPhase;
    if (!st) return;
    for (const b of html.querySelectorAll?.("[data-arn-dungeon]") ?? []) {
      if (!game.user.isGM) { b.remove(); continue; }
      b.addEventListener("click", async ev => {
        ev.preventDefault();
        const party = game.actors.get(st.party);
        if (!party) return ui.notifications.warn("That party is gone.");
        const act = b.dataset.arnDungeon;
        if (act === "reaction") return (await import("./gmtools.mjs")).reactionCheckDialog();
        if (party.flags?.[SYS]?.dungeonAt !== st.key) return ui.notifications.warn("The party has left that dungeon.");
        b.disabled = true;
        if (act === "stir") { const d = await stirDungeon(party, 1); ui.notifications.info(`The dungeon stirs: ${d} d12${d === 1 ? "" : "s"} from now on.`); }
        if (act === "threat") { const t = await setThreat(party, { delta: 1 }); if (t) ui.notifications.info(`The threat advances: ${t.threat}/${t.steps}.`); }
      });
    }
  });
}

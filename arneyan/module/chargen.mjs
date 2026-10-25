/**
 * Ability scores for a new character (Kieran, 19 Oct 2026): the first thing a new PC asks for.
 *
 * Method V (Player's Handbook, Attributes and Method V): two sets (Alpha and Beta), each six pools rolled in order
 * (8d6, 5d6 and 4d6 keeping the highest 3, then three pools of 3d6 keeping all 3); keep one whole set (Rule A).
 * Rule C, the Gygaxian Threshold: the chosen set needs at least two scores of 14 or higher, before ancestry bonuses;
 * if neither set qualifies and no donated set is available, discard both and roll both again. A set donated by
 * another player (Rule B), or rolled at the table, can be typed in instead. Then assign the six numbers. Ancestry
 * changes come after (dropping the ancestry), where no score starts above 18.
 */
import { ARNEYAN } from "./config.mjs";

const { DialogV2 } = foundry.applications.api;
const SYSFLAG = "arneyan";
const KEYS = ["str", "dex", "con", "int", "wis", "cha"];
export const POOLS = ["8d6kh3", "5d6kh3", "4d6kh3", "3d6", "3d6", "3d6"];
/**
 * The other way to roll (Kieran, 21 Oct 2026; the Handbook's optional Quick Roll from v0.10.6): 4d6 six times, dropping
 * the lowest die each time. Rule C still applies (two scores of 14 or higher, or roll again), as does the cap of 18.
 */
export const FOUR_D6 = Array(6).fill("4d6kh3");
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Rule C, the Gygaxian Threshold: at least two scores of 14 or higher. */
export const meetsThreshold = set => set.filter(n => n >= 14).length >= 2;
const LOW = "below the Gygaxian Threshold";

async function rollSet(pools = POOLS) {
  const rolls = [];
  for (const f of pools) rolls.push(await new Roll(f).evaluate());
  return rolls;
}

/* ---------------- Rule B: the table's donated sets ---------------- */
// Player feedback (23 Oct 2026): a Method V set not kept goes into a shared list anyone making a character can take
// it from. Kept in a world setting; players add and take through the active GM.
const SOCKET = `system.${SYSFLAG}`;
const SETTING = "donatedSets";
const goodSet = set => Array.isArray(set) && set.length === 6 && set.every(n => Number.isInteger(n) && n >= 3 && n <= 18) && meetsThreshold(set);
export function donatedSets() {
  try { return (game.settings.get(SYSFLAG, SETTING) ?? []).filter(d => goodSet(d?.set)); } catch { return []; }
}
async function writeDonated(list) { await game.settings.set(SYSFLAG, SETTING, list.slice(-20)); }
export async function gmDonate(set, from) {
  if (!goodSet(set)) return false;
  await writeDonated([...donatedSets(), { id: foundry.utils.randomID(), set: [...set], from: String(from ?? "").slice(0, 60), at: Date.now() }]);
  return true;
}
export async function gmTake(id, by = "") {
  const list = donatedSets();
  const d = list.find(x => x.id === id);
  if (!d) {
    ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients?.("GM")?.map(u => u.id) ?? [], content: `<p>A donated set ${by ? `${esc(by)} took ` : ""}was already gone from the list.</p>` });
    return false;
  }
  await writeDonated(list.filter(x => x.id !== id));
  return true;
}
/** Add or take a set: directly as the GM, otherwise through the active GM. False when no GM is on. */
function viaGm(action, data) {
  if (game.user.isGM) return action === "donate" ? gmDonate(data.set, data.from) : gmTake(data.id, data.by);
  if (!game.users.activeGM) return false;
  game.socket.emit(SOCKET, { action: `chargen.${action}`, ...data });
  return true;
}
function onSocket(msg) {
  if (!game.users.activeGM?.isSelf) return;
  if (msg?.action === "chargen.donate") gmDonate(msg.set, msg.from).catch(err => console.warn("Arneyan | donated set", err));
  if (msg?.action === "chargen.take") gmTake(msg.id, msg.by).catch(err => console.warn("Arneyan | donated set", err));
}

/** Ability score windows still open, by actor id: the 1st-level steps wait for them (scores come first). */
const OPEN = new Map();
export function scoresWindowFor(actor) { return OPEN.get(actor?.id) ?? null; }

export async function abilityScores(actor) {
  if (!actor?.isOwner || actor.type !== "character") return;
  if (OPEN.has(actor.id)) return OPEN.get(actor.id);
  const run = abilityScoresWindow(actor).finally(() => OPEN.delete(actor.id));
  OPEN.set(actor.id, run);
  return run;
}

async function abilityScoresWindow(actor) {
  let sets = null;          // [[17, 15, ...], [...]] once rolled
  let four = null;          // the 4d6 set, once rolled
  const donated = donatedSets();
  let using = null;         // the donated set filled in, if any
  const content = `<div class="arn-scores">
    <p>Method V: roll six pools in order (8d6, 5d6 and 4d6 keeping the highest 3, then 3d6 three times keeping all 3) for Set Alpha, then again for Set Beta. Keep one whole set; you can't swap scores between them (Rule A). The set you keep needs at least two scores of 14 or higher (Rule C, the Gygaxian Threshold). The set you don't keep can be donated to the table (Rule B). Then put each score on an attribute. Your ancestry's changes come when you drop it on the sheet; no score starts above 18.</p>
    <div class="arn-scores-mode">
      <label><input type="radio" name="mode" value="roll" checked> Roll Method V</label>
      <label><input type="radio" name="mode" value="four"> Roll 4d6, drop the lowest</label>
      <label><input type="radio" name="mode" value="own"> Type in a set (donated, or rolled at the table)${donated.length ? ` <span class="arn-chip gold">${donated.length} donated</span>` : ""}</label>
    </div>
    <div class="arn-scores-donated" hidden>${donated.length ? `<p class="hint">Sets other players didn't keep (Rule B). Use one to fill in the scores; it leaves the list when you set your scores.</p>
      ${donated.map(d => `<div class="arn-scores-don"><button type="button" class="arn-btn small" data-donated="${d.id}"><i class="fa-solid fa-hand-holding-heart"></i> Use</button> <strong>${d.set.join(", ")}</strong>${d.from ? ` <span class="arn-muted">from ${esc(d.from)}</span>` : ""}${game.user.isGM ? ` <a class="arn-scores-don-remove" data-remove="${d.id}" data-tooltip="Take it off the list"><i class="fa-solid fa-xmark"></i></a>` : ""}</div>`).join("")}`
      : `<p class="hint">No donated sets right now. Type in a set rolled at the table.</p>`}</div>
    <div class="arn-scores-roll"><button type="button" class="arn-scores-rollbtn"><i class="fa-solid fa-dice"></i> Roll both sets</button><div class="arn-scores-sets"></div></div>
    <div class="arn-scores-four" hidden><p class="hint">The Quick Roll: roll 4d6 six times, dropping the lowest die each time, then put each score on an attribute. Rule C still applies: without two scores of 14 or higher, roll again.</p><button type="button" class="arn-scores-fourbtn"><i class="fa-solid fa-dice"></i> Roll 4d6 six times</button><div class="arn-scores-fourset"></div></div>
    <div class="arn-scores-own" hidden>${KEYS.map((k, i) => `<input type="number" name="own${i}" min="3" max="18" value="${[15, 14, 13, 12, 10, 8][i]}">`).join("")}</div>
    <table class="arn-scores-assign"><tbody>${KEYS.map((k, i) => `<tr><th>${ARNEYAN.abilities[k]}</th><td><select name="as-${k}" data-i="${i}"></select></td><td class="arn-scores-mod" data-k="${k}"></td></tr>`).join("")}</tbody></table>
    <p class="hint arn-scores-msg"></p>
  </div>`;
  const res = await DialogV2.wait({
    window: { title: `${actor.name}: ability scores`, icon: "fa-solid fa-dice" }, position: { width: 500 }, classes: ["arneyan", "arn-scores-app"], content,
    render: (event, dialog) => {
      const el = dialog.element ?? dialog;
      const q = s => el.querySelector(s);
      const msg = q(".arn-scores-msg");
      const mode = () => q("input[name=mode]:checked")?.value;
      const current = () => {
        if (mode() === "four") return four;
        if (mode() === "own") return [...el.querySelectorAll(".arn-scores-own input")].map(i => Math.clamp(Number(i.value) || 3, 3, 18));
        const pick = q("input[name=set]:checked");
        return sets && pick ? sets[Number(pick.value)] : null;
      };
      const fill = () => {
        const set = current();
        el.querySelectorAll(".arn-scores-assign select").forEach((sel, i) => {
          const keep = sel.value;
          sel.innerHTML = set ? set.map((n, j) => `<option value="${j}">${n}</option>`).join("") : `<option value="">-</option>`;
          sel.value = keep !== "" && set && Number(keep) < set.length ? keep : String(i);
        });
        mods();
      };
      const mods = () => {
        const set = current();
        el.querySelectorAll(".arn-scores-assign select").forEach(sel => {
          const k = sel.name.slice(3);
          const n = set?.[Number(sel.value)];
          const cell = q(`.arn-scores-mod[data-k=${k}]`);
          if (cell) cell.textContent = n === undefined ? "" : `${ARNEYAN.abilityMod(n) >= 0 ? "+" : ""}${ARNEYAN.abilityMod(n)}`;
        });
        const used = [...el.querySelectorAll(".arn-scores-assign select")].map(s => s.value);
        const own = mode() === "own";
        const dupes = set && new Set(used).size < used.length;
        // Rule C, the Gygaxian Threshold, for every way of rolling (the Quick Roll too, Handbook v0.10.6).
        const low = set && !meetsThreshold(set);
        const bothLow = sets && !sets.some(meetsThreshold);
        if (dupes) msg.textContent = "Each score goes on one attribute only.";
        else if (low && mode() === "four") msg.textContent = "This set doesn't have two scores of 14 or higher (Rule C): roll again.";
        else if (low && own) msg.textContent = "This set needs at least two scores of 14 or higher (Rule C, the Gygaxian Threshold).";
        else if (low && bothLow) msg.textContent = `Neither set has two scores of 14 or higher: discard both and roll again, or take a set another player donated (Type in a set${donated.length ? `: ${donated.length} waiting` : ""}).`;
        else if (low) msg.textContent = "This set doesn't have two scores of 14 or higher (Rule C): keep the other set.";
        else if (!set) msg.textContent = own ? "" : mode() === "four" ? "Roll the 4d6 set first." : "Roll the two sets first.";
        else msg.textContent = "";
        // Only a complete, legal assignment can be set (the rolled sets stay in this window, so nothing is rerolled).
        const ok = el.querySelector("button[data-action=ok]");
        if (ok) ok.disabled = !set || dupes || low;
      };
      el.querySelectorAll("input[name=mode]").forEach(r => r.addEventListener("change", () => {
        const m = mode();
        q(".arn-scores-own").hidden = m !== "own";
        q(".arn-scores-donated").hidden = m !== "own";
        q(".arn-scores-roll").hidden = m !== "roll";
        q(".arn-scores-four").hidden = m !== "four";
        fill();
      }));
      el.querySelectorAll(".arn-scores-own input").forEach(i => i.addEventListener("change", fill));
      el.querySelectorAll("[data-donated]").forEach(b => b.addEventListener("click", () => {
        const d = donated.find(x => x.id === b.dataset.donated);
        if (!d) return;
        using = d;
        el.querySelectorAll(".arn-scores-own input").forEach((inp, i) => { inp.value = d.set[i]; });
        el.querySelectorAll(".arn-scores-don").forEach(row => row.classList.toggle("chosen", row.contains(b)));
        fill();
      }));
      el.querySelectorAll("[data-remove]").forEach(a => a.addEventListener("click", async () => {
        await gmTake(a.dataset.remove);
        a.closest(".arn-scores-don")?.remove();
      }));
      el.querySelector(".arn-scores-assign").addEventListener("change", mods);
      q(".arn-scores-rollbtn").addEventListener("click", async ev => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        // One way of rolling per character: 4d6 is shut before the dice even land.
        const f4 = q("input[name=mode][value=four]");
        if (f4) f4.disabled = true;
        const a = await rollSet(), b = await rollSet();
        sets = [a.map(r => r.total), b.map(r => r.total)];
        const names = ["Alpha", "Beta"];
        const ok = sets.map(meetsThreshold);
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }), rolls: [...a, ...b],
          content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-dice"></i> <span>${esc(actor.name)}: Method V</span></header>
            ${sets.map((s, i) => `<p><strong>Set ${names[i]}:</strong> ${s.join(", ")}${ok[i] ? "" : ` <em>(${LOW})</em>`}</p>`).join("")}</div>`
        });
        q(".arn-scores-sets").innerHTML = sets.map((s, i) => `<label class="arn-scores-set ${ok[i] ? "" : "low"}"><input type="radio" name="set" value="${i}" ${i === (ok[0] || !ok[1] ? 0 : 1) ? "checked" : ""}> Set ${names[i]}: <strong>${s.join(", ")}</strong>${ok[i] ? "" : ` (${LOW})`}</label>`).join("");
        el.querySelectorAll("input[name=set]").forEach(r => r.addEventListener("change", fill));
        if (!ok[0] && !ok[1]) {
          btn.disabled = false;
          btn.innerHTML = `<i class="fa-solid fa-dice"></i> Roll again`;
        }
        fill();
      });
      q(".arn-scores-fourbtn").addEventListener("click", async ev => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        // One way of rolling per character: Method V is shut before the dice even land.
        const mv = q("input[name=mode][value=roll]");
        if (mv) mv.disabled = true;
        const rolls = await rollSet(FOUR_D6);
        four = rolls.map(r => r.total);
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }), rolls,
          content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-dice"></i> <span>${esc(actor.name)}: 4d6, drop the lowest</span></header><p><strong>${four.join(", ")}</strong>${meetsThreshold(four) ? "" : ` <em>(${LOW}: roll again)</em>`}</p></div>`
        });
        const good = meetsThreshold(four);
        q(".arn-scores-fourset").innerHTML = `<p>Rolled: <strong>${four.join(", ")}</strong>${good ? "" : ` (${LOW})`}</p>`;
        if (!good) { btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-dice"></i> Roll again`; }
        fill();
      });
      fill();
    },
    buttons: [
      { action: "ok", label: "Set the scores", default: true, callback: (ev, btn) => {
        const f = btn.form;
        const m = f.querySelector("input[name=mode]:checked")?.value;
        const own = m === "own";
        if (m === "four") {
          const idx = KEYS.map(k => Number(f.elements[`as-${k}`].value));
          if (!four || new Set(idx).size !== 6 || !meetsThreshold(four)) return null;
          return { scores: Object.fromEntries(KEYS.map((k, i) => [k, four[idx[i]]])), spare: null };
        }
        const kept = own ? null : Number(f.querySelector("input[name=set]:checked")?.value);
        const set = own ? [...f.querySelectorAll(".arn-scores-own input")].map(i => Math.clamp(Number(i.value) || 3, 3, 18)) : sets?.[kept];
        const idx = KEYS.map(k => Number(f.elements[`as-${k}`].value));
        if (!set || new Set(idx).size !== 6 || !meetsThreshold(set)) return null;
        // Rule B: the rolled set not kept, if it's a good one, can go to the table.
        const spare = own ? null : sets?.[1 - kept];
        // A donated set used as it was (not changed after Use) leaves the list.
        const took = own && using && using.set.every((n, i) => n === set[i]) ? using.id : null;
        return { scores: Object.fromEntries(KEYS.map((k, i) => [k, set[idx[i]]])), spare: spare && meetsThreshold(spare) ? { name: kept ? "Alpha" : "Beta", set: spare } : null, took };
      } },
      { action: "skip", label: "Later" }
    ],
    rejectClose: false
  });
  if (!res || res === "skip") return;
  // Remembered so a first ancestry above 1st level knows its bonuses still need adding (progression.mjs).
  await actor.update({ ...Object.fromEntries(KEYS.map(k => [`system.abilities.${k}.value`, res.scores[k]])), "flags.arneyan.scoresRolled": true, "flags.arneyan.-=needsScores": null });
  if (res.took) {
    const ok = await viaGm("take", { id: res.took, by: actor.name });
    if (!ok) ui.notifications.warn("No GM is on to take that set off the donated list: ask the GM to remove it.");
  }
  if (res.spare) {
    const added = await viaGm("donate", { set: res.spare.set, from: actor.name });
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p>${esc(actor.name)} kept Set ${res.spare.name === "Alpha" ? "Beta" : "Alpha"}. Set ${res.spare.name} (${res.spare.set.join(", ")}) ${added ? "goes on the table's donated sets (Rule B): anyone making a character can take it under Type in a set." : "can be donated to the table (Rule B); no GM is on to add it to the donated sets, so type it in by hand."}</p>` });
  }
  ui.notifications.info(`${actor.name}: ${KEYS.map(k => `${ARNEYAN.abilityAbbr[k]} ${res.scores[k]}`).join(", ")}. Next, drop an ancestry and a class on the sheet.`);
}

/** A player owner of this actor (not a GM), if it has one. */
const playerOwner = actor => {
  const players = [...(game.users ?? [])].filter(u => !u.isGM && actor.testUserPermission?.(u, "OWNER"));
  // The player whose character it is; otherwise the first owner (by id, the same on every client).
  return players.find(u => u.character?.id === actor.id) ?? players.sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
};
/** Still the blank sheet it was made as: every score 10, no class. */
const blank = actor => KEYS.every(k => actor.system.abilities[k].value === 10) && !actor.items.some(i => i.type === "class");
/** Characters whose scores window this client has already opened from the sheet (once per session, never a loop). */
const ASKED = new Set();

/** Open the scores window as the setup's first step (other steps wait for it: see scoresWindowFor). */
function startScores(actor) {
  let go;
  OPEN.set(actor.id, new Promise(r => { go = r; }));
  setTimeout(() => { OPEN.delete(actor.id); abilityScores(actor).finally(() => go()); }, 400);
}

export function registerChargen() {
  game.settings?.register?.(SYSFLAG, SETTING, { scope: "world", config: false, type: Array, default: [] });
  Hooks.once("ready", () => game.socket.on(SOCKET, onSocket));
  // A brand-new character (not imported, duplicated or from a compendium) asks for its scores first. It's marked as
  // needing them, so whoever plays it is asked when they first open it: players can't usually make characters, so
  // the GM makes one and hands it over (20 Oct 2026: the window used to open for the GM only).
  Hooks.on("createActor", (actor, options, userId) => {
    if (userId !== game.user.id || actor.type !== "character" || options?.arneyanNoSetup || options?.arneyanTransform || actor.getFlag(SYSFLAG, "transform") || actor.flags?.["item-piles"]) return;
    if (actor.items.size || actor._stats?.compendiumSource || actor.flags?.core?.sourceId || actor._stats?.duplicateSource) return;
    if (!KEYS.every(k => actor.system.abilities[k].value === 10)) return;
    actor.setFlag(SYSFLAG, "needsScores", true).catch(() => {});
    // The GM making it for a player who already owns it: the player is asked, not the GM.
    if (game.user.isGM && playerOwner(actor)) return;
    // Mark it pending at once, so a class dropped straight away waits for the scores (Book II order).
    ASKED.add(actor.id);
    startScores(actor);
  });
  // The player who owns a character still waiting for its scores opens its sheet: ask them, once.
  Hooks.on("renderActorSheetV2", app => {
    const actor = app.document ?? app.actor;
    if (!actor || actor.type !== "character" || game.user.isGM || !actor.isOwner || ASKED.has(actor.id)) return;
    // Only one player is asked, so two can't roll over each other.
    if (playerOwner(actor)?.id !== game.user.id) return;
    if (!actor.getFlag(SYSFLAG, "needsScores") || !blank(actor) || OPEN.has(actor.id)) return;
    ASKED.add(actor.id);
    startScores(actor);
  });
}

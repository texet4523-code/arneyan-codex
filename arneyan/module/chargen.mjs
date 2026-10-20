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
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Rule C, the Gygaxian Threshold: at least two scores of 14 or higher. */
export const meetsThreshold = set => set.filter(n => n >= 14).length >= 2;
const LOW = "below the Gygaxian Threshold";

async function rollSet() {
  const rolls = [];
  for (const f of POOLS) rolls.push(await new Roll(f).evaluate());
  return rolls;
}

export async function abilityScores(actor) {
  if (!actor?.isOwner || actor.type !== "character") return;
  let sets = null;          // [[17, 15, ...], [...]] once rolled
  const content = `<div class="arn-scores">
    <p>Method V: roll six pools in order (8d6, 5d6 and 4d6 keeping the highest 3, then 3d6 three times keeping all 3) for Set Alpha, then again for Set Beta. Keep one whole set; you can't swap scores between them (Rule A). The set you keep needs at least two scores of 14 or higher (Rule C, the Gygaxian Threshold). The set you don't keep can be donated to the table (Rule B). Then put each score on an attribute. Your ancestry's changes come when you drop it on the sheet; no score starts above 18.</p>
    <div class="arn-scores-mode">
      <label><input type="radio" name="mode" value="roll" checked> Roll Method V</label>
      <label><input type="radio" name="mode" value="own"> Type in a set (donated, or rolled at the table)</label>
    </div>
    <div class="arn-scores-roll"><button type="button" class="arn-scores-rollbtn"><i class="fa-solid fa-dice"></i> Roll both sets</button><div class="arn-scores-sets"></div></div>
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
      const current = () => {
        if (q("input[name=mode]:checked")?.value === "own") return [...el.querySelectorAll(".arn-scores-own input")].map(i => Math.clamp(Number(i.value) || 3, 3, 18));
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
        const own = q("input[name=mode]:checked")?.value === "own";
        const dupes = set && new Set(used).size < used.length;
        const low = set && !meetsThreshold(set);
        const bothLow = sets && !sets.some(meetsThreshold);
        if (dupes) msg.textContent = "Each score goes on one attribute only.";
        else if (low && own) msg.textContent = "This set needs at least two scores of 14 or higher (Rule C, the Gygaxian Threshold).";
        else if (low && bothLow) msg.textContent = "Neither set has two scores of 14 or higher: discard both and roll again, or take a set another player donated (Type in a set).";
        else if (low) msg.textContent = "This set doesn't have two scores of 14 or higher (Rule C): keep the other set.";
        else if (!set) msg.textContent = own ? "" : "Roll the two sets first.";
        else msg.textContent = "";
        // Only a complete, legal assignment can be set (the rolled sets stay in this window, so nothing is rerolled).
        const ok = el.querySelector("button[data-action=ok]");
        if (ok) ok.disabled = !set || dupes || low;
      };
      el.querySelectorAll("input[name=mode]").forEach(r => r.addEventListener("change", () => {
        const own = q("input[name=mode]:checked").value === "own";
        q(".arn-scores-own").hidden = !own;
        q(".arn-scores-roll").hidden = own;
        fill();
      }));
      el.querySelectorAll(".arn-scores-own input").forEach(i => i.addEventListener("change", fill));
      el.querySelector(".arn-scores-assign").addEventListener("change", mods);
      q(".arn-scores-rollbtn").addEventListener("click", async ev => {
        const btn = ev.currentTarget;
        btn.disabled = true;
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
      fill();
    },
    buttons: [
      { action: "ok", label: "Set the scores", default: true, callback: (ev, btn) => {
        const f = btn.form;
        const own = f.querySelector("input[name=mode]:checked")?.value === "own";
        const kept = own ? null : Number(f.querySelector("input[name=set]:checked")?.value);
        const set = own ? [...f.querySelectorAll(".arn-scores-own input")].map(i => Math.clamp(Number(i.value) || 3, 3, 18)) : sets?.[kept];
        const idx = KEYS.map(k => Number(f.elements[`as-${k}`].value));
        if (!set || new Set(idx).size !== 6 || !meetsThreshold(set)) return null;
        // Rule B: the rolled set not kept, if it's a good one, can go to the table.
        const spare = own ? null : sets?.[1 - kept];
        return { scores: Object.fromEntries(KEYS.map((k, i) => [k, set[idx[i]]])), spare: spare && meetsThreshold(spare) ? { name: kept ? "Alpha" : "Beta", set: spare } : null };
      } },
      { action: "skip", label: "Later" }
    ],
    rejectClose: false
  });
  if (!res || res === "skip") return;
  await actor.update(Object.fromEntries(KEYS.map(k => [`system.abilities.${k}.value`, res.scores[k]])));
  if (res.spare) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p>${esc(actor.name)} kept Set ${res.spare.name === "Alpha" ? "Beta" : "Alpha"}. Set ${res.spare.name} (${res.spare.set.join(", ")}) can be donated to the table (Rule B).</p>` });
  ui.notifications.info(`${actor.name}: ${KEYS.map(k => `${ARNEYAN.abilityAbbr[k]} ${res.scores[k]}`).join(", ")}. Next, drop an ancestry and a class on the sheet.`);
}

export function registerChargen() {
  // A brand-new character (not imported, duplicated or from a compendium) asks for its scores first.
  Hooks.on("createActor", (actor, options, userId) => {
    if (userId !== game.user.id || actor.type !== "character" || options?.arneyanNoSetup || options?.arneyanTransform || actor.getFlag(SYSFLAG, "transform") || actor.flags?.["item-piles"]) return;
    if (actor.items.size || actor._stats?.compendiumSource || actor.flags?.core?.sourceId || actor._stats?.duplicateSource) return;
    if (!KEYS.every(k => actor.system.abilities[k].value === 10)) return;
    setTimeout(() => abilityScores(actor), 400);
  });
}

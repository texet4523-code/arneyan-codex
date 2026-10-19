/**
 * Ability scores for a new character (Kieran, 19 Oct 2026): the first thing a new PC asks for.
 *
 * Method V (Book II, Attributes): two sets, each six descending pools (8d6, 6d6, 5d6, 4d6, 3d6, 3d6), keeping the
 * best three dice of each; keep one whole set. The Gygaxian Threshold: a set needs two scores of 15 or more; if
 * neither does (and nobody has donated one), roll again. A set donated by another player, or rolled at the table,
 * can be typed in instead. Then assign the six numbers. Ancestry changes come after (dropping the ancestry).
 */
import { ARNEYAN } from "./config.mjs";

const { DialogV2 } = foundry.applications.api;
const SYSFLAG = "arneyan";
const KEYS = ["str", "dex", "con", "int", "wis", "cha"];
const POOLS = ["8d6kh3", "6d6kh3", "5d6kh3", "4d6kh3", "3d6", "3d6"];
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Two scores of 15 or more. */
export const meetsThreshold = set => set.filter(n => n >= 15).length >= 2;

async function rollSet() {
  const rolls = [];
  for (const f of POOLS) rolls.push(await new Roll(f).evaluate());
  return rolls;
}

export async function abilityScores(actor) {
  if (!actor?.isOwner || actor.type !== "character") return;
  let sets = null;          // [[17, 15, ...], [...]] once rolled
  const content = `<div class="arn-scores">
    <p>Book II, Method V: two sets of six dice pools (8d6, 6d6, 5d6, 4d6, 3d6 and 3d6, keeping the best three of each). Keep one whole set; a set needs two scores of 15 or more. Then put each number on an attribute. Your ancestry's changes come when you drop it on the sheet.</p>
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
          sel.innerHTML = set ? set.map((n, j) => `<option value="${j}">${n}</option>`).join("") : `<option value="">—</option>`;
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
        const low = set && !own && !meetsThreshold(set);
        if (dupes) msg.textContent = "Each number goes on one attribute only.";
        else if (low) msg.textContent = "This set doesn't have two scores of 15 or more: keep the other set, roll again, or type in a donated set.";
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
            ${sets.map((s, i) => `<p><strong>Set ${names[i]}:</strong> ${s.join(", ")}${ok[i] ? "" : " <em>(below the threshold)</em>"}</p>`).join("")}</div>`
        });
        q(".arn-scores-sets").innerHTML = sets.map((s, i) => `<label class="arn-scores-set ${ok[i] ? "" : "low"}"><input type="radio" name="set" value="${i}" ${i === (ok[0] || !ok[1] ? 0 : 1) ? "checked" : ""}> Set ${names[i]}: <strong>${s.join(", ")}</strong>${ok[i] ? "" : " (below the threshold)"}</label>`).join("");
        el.querySelectorAll("input[name=set]").forEach(r => r.addEventListener("change", fill));
        if (!ok[0] && !ok[1]) {
          msg.textContent = "Neither set has two scores of 15 or more: roll again, or take a set another player donated (Type in a set).";
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
        const set = own ? [...f.querySelectorAll(".arn-scores-own input")].map(i => Math.clamp(Number(i.value) || 3, 3, 18))
          : sets?.[Number(f.querySelector("input[name=set]:checked")?.value)];
        const idx = KEYS.map(k => Number(f.elements[`as-${k}`].value));
        if (!set || new Set(idx).size !== 6 || (!own && !meetsThreshold(set))) return null;
        return { scores: Object.fromEntries(KEYS.map((k, i) => [k, set[idx[i]]])) };
      } },
      { action: "skip", label: "Later" }
    ],
    rejectClose: false
  });
  if (!res || res === "skip") return;
  await actor.update(Object.fromEntries(KEYS.map(k => [`system.abilities.${k}.value`, res.scores[k]])));
  ui.notifications.info(`${actor.name}: ${KEYS.map(k => `${ARNEYAN.abilityAbbr[k]} ${res.scores[k]}`).join(", ")}. Next, drop an ancestry and a class on the sheet.`);
}

export function registerChargen() {
  // A brand-new character (not imported, duplicated or from a compendium) asks for its scores first.
  Hooks.on("createActor", (actor, options, userId) => {
    if (userId !== game.user.id || actor.type !== "character" || options?.arneyanNoSetup || options?.arneyanTransform || actor.getFlag(SYSFLAG, "transform")) return;
    if (actor.items.size || actor._stats?.compendiumSource || actor.flags?.core?.sourceId || actor._stats?.duplicateSource) return;
    if (!KEYS.every(k => actor.system.abilities[k].value === 10)) return;
    setTimeout(() => abilityScores(actor), 400);
  });
}

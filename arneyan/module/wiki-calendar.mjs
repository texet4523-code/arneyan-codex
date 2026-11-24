/**
 * The calendar and the wiki (Kieran, 24 Nov 2026: "change the date and it syncs to the calendar when I want it to").
 *
 * Kanka is retired: the wiki at arneyan-wiki.pages.dev keeps "Today in Arneyan" now. Nothing is sent on its own. The GM
 * presses "Send to the wiki" when the wiki should follow Foundry's date; that opens the wiki's calendar on this day in a
 * new tab, signed in as the GM, where one click makes it today in Arneyan. The wiki sits behind its own sign-in, so
 * Foundry needs no key or token, and nothing changes there until the GM confirms it.
 */
import * as C from "./calendar-data.mjs";

const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function registerWikiCalendar() {
  game.settings.register(SYS, "wikiUrl", { scope: "world", config: false, type: String, default: "https://arneyan-wiki.pages.dev/" });
}

/** The wiki's calendar on a date ({ year, month, day }), with the GM's "make this today" offer. */
export function wikiDayUrl(base, { year, month, day }) {
  const root = /^https?:\/\//.test(String(base ?? "")) ? String(base).replace(/\/*$/, "/") : "https://arneyan-wiki.pages.dev/";
  return `${root}#/calendar/${year}/${month}/${day}/foundry`;
}

/** The GM's Wiki window: this calendar's date, and the button that sends it. */
export async function wikiDialog({ today }) {
  if (!game.user.isGM) return;
  const { DialogV2 } = foundry.applications.api;
  const t = today();
  const content = `<div class="arn-kanka">
    <p>This calendar's date is <strong>${esc(C.dateText(t))}</strong>.</p>
    <p class="hint">The wiki keeps its own "Today in Arneyan" and never follows this date by itself. <strong>Send to the wiki</strong> opens the wiki's calendar on this day in a new tab; press <strong>Make this today in Arneyan</strong> there when you want the wiki to match. Players see it a couple of minutes later.</p>
    <div class="form-group"><label>Wiki address</label><input type="text" name="url" value="${esc(game.settings.get(SYS, "wikiUrl"))}"></div>
  </div>`;
  const act = await DialogV2.wait({
    window: { title: "The wiki's calendar", icon: "fa-solid fa-book-atlas" }, classes: ["arneyan", "arn-kanka-dialog"], position: { width: 520 }, content,
    buttons: [
      { action: "send", label: "Send to the wiki", icon: "fa-solid fa-arrow-up-right-from-square", default: true, callback: async (ev, btn) => { await game.settings.set(SYS, "wikiUrl", btn.form.elements.url.value.trim()); return "send"; } },
      { action: "close", label: "Close" }
    ],
    rejectClose: false
  });
  if (act === "send") window.open(wikiDayUrl(game.settings.get(SYS, "wikiUrl"), today()), "_blank", "noopener");
}

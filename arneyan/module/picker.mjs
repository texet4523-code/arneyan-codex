/**
 * A browser-style chooser for level-up choices: a searchable list on the left (grouped, with a line of detail on
 * each), and the chosen entry's full description on the right, so a player can read what a Feat or Skill does before
 * taking it. Also: describeSelects(), which puts the same description under ordinary <select> boxes in a window.
 */
const { DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const TE = () => foundry.applications.ux.TextEditor.implementation;

/** Enriched description of a compendium entry or an owned item (by uuid), cached per call site. */
async function descriptionOf(uuid, cache) {
  if (cache.has(uuid)) return cache.get(uuid);
  let html = "";
  try {
    const doc = await fromUuid(uuid);
    const sys = doc?.system ?? {};
    const bits = [];
    if (sys.path) bits.push(esc(sys.path));
    if (sys.ability && CONFIG.ARNEYAN?.abilities?.[sys.ability]) bits.push(esc(CONFIG.ARNEYAN.abilities[sys.ability]));
    if (sys.uses?.max) bits.push(`${sys.uses.max}/${esc(CONFIG.ARNEYAN?.usesPer?.[sys.uses.per] ?? sys.uses.per ?? "")}`);
    const body = await TE().enrichHTML(sys.description ?? "", { relativeTo: doc });
    html = `<h3>${esc(doc?.name ?? "")}</h3>${bits.length ? `<p class="arn-pick-meta">${bits.join(" · ")}</p>` : ""}${body || "<p class=\"arn-muted\">No description.</p>"}`;
  } catch (err) {
    html = `<p class="arn-muted">Couldn't load the description.</p>`;
  }
  cache.set(uuid, html);
  return html;
}

/**
 * Ask the user to pick one entry. entries: [{ value, uuid, name, group, meta }]. Returns the picked value, "later",
 * or null when closed. `intro` is HTML above the list; `takeLabel` names the main button.
 */
export async function pickFromList({ title, intro = "", entries = [], takeLabel = "Take", laterLabel = "Choose later", width = 760 } = {}) {
  if (!entries.length) return null;
  const cache = new Map();
  const groups = new Map();
  for (const e of entries) (groups.get(e.group ?? "") ?? groups.set(e.group ?? "", []).get(e.group ?? "")).push(e);
  const list = [...groups.entries()].map(([g, rows]) => `${g ? `<li class="arn-pick-group">${esc(g)}</li>` : ""}${rows.map(e =>
    `<li class="arn-pick-row" data-value="${esc(e.value)}" data-uuid="${esc(e.uuid ?? "")}" data-name="${esc((e.name ?? "").toLowerCase())}">
      <label><input type="radio" name="pick" value="${esc(e.value)}"><span class="arn-pick-name">${esc(e.name)}</span>${e.meta ? `<span class="arn-pick-sub">${esc(e.meta)}</span>` : ""}</label></li>`).join("")}`).join("");
  const content = `${intro}<div class="arn-pick">
      <div class="arn-pick-left"><input type="search" class="arn-pick-search" placeholder="Search" aria-label="Search"><ul class="arn-pick-list">${list}</ul></div>
      <div class="arn-pick-desc"><p class="arn-muted">Click one to read what it does.</p></div>
    </div>`;
  const res = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-book-atlas", resizable: true },
    classes: ["arneyan", "arn-picker"], position: { width, height: "auto" },
    content,
    render: (ev, dialog) => {
      const root = dialog.element ?? dialog;
      const desc = root.querySelector(".arn-pick-desc");
      const show = async row => {
        root.querySelectorAll(".arn-pick-row.active").forEach(r => r.classList.remove("active"));
        row.classList.add("active");
        const radio = row.querySelector("input[type=radio]");
        if (radio) radio.checked = true;
        const uuid = row.dataset.uuid;
        desc.innerHTML = uuid ? await descriptionOf(uuid, cache) : `<h3>${esc(row.querySelector(".arn-pick-name")?.textContent ?? "")}</h3>`;
      };
      root.querySelectorAll(".arn-pick-row").forEach(row => row.addEventListener("click", () => show(row)));
      root.querySelector(".arn-pick-search")?.addEventListener("input", e => {
        const q = e.target.value.trim().toLowerCase();
        root.querySelectorAll(".arn-pick-row").forEach(r => { r.hidden = !!q && !r.dataset.name.includes(q); });
        root.querySelectorAll(".arn-pick-group").forEach(g => {
          let n = g.nextElementSibling, any = false;
          while (n && !n.classList.contains("arn-pick-group")) { if (!n.hidden) any = true; n = n.nextElementSibling; }
          g.hidden = !any;
        });
      });
    },
    buttons: [
      { action: "take", label: takeLabel, icon: "fa-solid fa-check", default: true, callback: (ev, btn) => btn.form?.querySelector("input[name=pick]:checked")?.value ?? "" },
      { action: "later", label: laterLabel }
    ],
    rejectClose: false
  });
  // Take with nothing chosen: say so and open it again, so the choice isn't lost.
  if (res === "") {
    ui.notifications.warn("Pick one first, or press Choose later.");
    return pickFromList({ title, intro, entries, takeLabel, laterLabel, width });
  }
  return res;
}

/**
 * For windows with <select data-describe> boxes whose options are uuids: show the selected entry's description under
 * each box. Call from a DialogV2 `render` callback.
 */
export function describeSelects(root) {
  const cache = new Map();
  for (const sel of root.querySelectorAll("select[data-describe]")) {
    let box = sel.parentElement?.nextElementSibling;
    if (!box?.classList?.contains("arn-select-desc")) {
      box = document.createElement("div");
      box.className = "arn-select-desc";
      sel.closest(".form-group")?.after(box);
    }
    const update = async () => {
      const uuid = sel.value;
      box.innerHTML = uuid && uuid.includes(".") ? await descriptionOf(uuid, cache) : "";
      box.hidden = !box.innerHTML;
    };
    sel.addEventListener("change", update);
    update();
  }
}

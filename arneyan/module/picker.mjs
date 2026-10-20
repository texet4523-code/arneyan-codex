/**
 * A browser-style chooser for character choices: a searchable list on the left (grouped, with a line of detail on
 * each), and the clicked entry's full description on the right, so a player can read what a Kit, Feat, Skill or
 * ancestry option does before taking it. One pick (radio rows) or several (tick boxes, with a counter).
 */
const { DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const TE = () => foundry.applications.ux.TextEditor.implementation;

/** A window title with its step, if any: "Tess: Fighter Kit (Step 2 of 4)". */
export const stepTitle = (title, step) => (step ? `${title} (${step})` : title);

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
 * Ask the user to pick from a list. entries: [{ value, uuid, name, group, meta, html }]: `uuid` shows that document's
 * description, `html` shows the given text instead (an ancestry's subtype has no document of its own).
 *
 * Options: `intro` (HTML above the list), `takeLabel` (the main button), `laterLabel`, `step` ("Step 2 of 4", added
 * to the title), `preselect` (a value, or values when picking several), `skipLabel` (adds a "skip" button), `buttons`
 * (more footer buttons, [{ action, label, icon }]), and `max` above 1 to pick several: tick boxes and a counter,
 * up to `max`; fewer is allowed with a warning unless `exact` is set.
 *
 * Returns the picked value (an array of values when `max` > 1), "later", "skip" or another footer button's action,
 * or null when the window is closed. Take with nothing chosen warns and opens the window again.
 */
export async function pickFromList(opts = {}) {
  const { title, intro = "", entries = [], takeLabel = "Take", laterLabel = "Choose later", width = 760,
    max = 1, exact = false, preselect = null, skipLabel = "", buttons = [], step = "" } = opts;
  if (!entries.length) return null;
  const many = Math.max(1, Math.floor(Number(max) || 1));
  const multi = many > 1;
  const cache = new Map();
  const byValue = new Map(entries.map(e => [String(e.value), e]));
  const pre = new Set((Array.isArray(preselect) ? preselect : preselect != null ? [preselect] : [])
    .map(String).filter(v => byValue.has(v)).slice(0, many));
  const groups = new Map();
  for (const e of entries) (groups.get(e.group ?? "") ?? groups.set(e.group ?? "", []).get(e.group ?? "")).push(e);
  const text = e => `<span class="arn-pick-name">${esc(e.name)}</span>${e.meta ? `<span class="arn-pick-sub">${esc(e.meta)}</span>` : ""}`;
  const row = e => {
    const v = String(e.value);
    const on = pre.has(v) ? " checked" : "";
    const attrs = `data-value="${esc(v)}" data-uuid="${esc(e.uuid ?? "")}" data-name="${esc((e.name ?? "").toLowerCase())}"`;
    // Several: the box ticks it, the name only shows what it does (so reading one doesn't choose it).
    return multi
      ? `<li class="arn-pick-row${on ? " picked" : ""}" ${attrs}><input type="checkbox" name="pick" value="${esc(v)}" aria-label="Choose ${esc(e.name)}"${on}><span class="arn-pick-text">${text(e)}</span></li>`
      : `<li class="arn-pick-row" ${attrs}><label><input type="radio" name="pick" value="${esc(v)}"${on}>${text(e)}</label></li>`;
  };
  const list = [...groups.entries()].map(([g, rows]) => `${g ? `<li class="arn-pick-group">${esc(g)}</li>` : ""}${rows.map(row).join("")}`).join("");
  const counter = multi ? `<p class="arn-pick-count" aria-live="polite">${pre.size} of ${many} chosen</p><p class="arn-pick-tip">Tick a box to choose it; click a name to read it.</p>` : "";
  const content = `${intro}<div class="arn-pick${multi ? " arn-pick-multi" : ""}">
      <div class="arn-pick-left"><input type="search" class="arn-pick-search" placeholder="Search" aria-label="Search">${counter}<ul class="arn-pick-list">${list}</ul></div>
      <div class="arn-pick-desc"><p class="arn-muted">Click one to read what it does.</p></div>
    </div>`;
  const res = await DialogV2.wait({
    window: { title: stepTitle(title, step), icon: "fa-solid fa-book-atlas", resizable: true },
    classes: ["arneyan", "arn-picker"], position: { width, height: "auto" },
    content,
    render: (ev, dialog) => {
      const root = dialog.element ?? dialog;
      const desc = root.querySelector(".arn-pick-desc");
      const take = root.querySelector('[data-action="take"]');
      const show = async row => {
        root.querySelectorAll(".arn-pick-row.active").forEach(r => r.classList.remove("active"));
        row.classList.add("active");
        if (!multi) { const radio = row.querySelector("input[type=radio]"); if (radio) radio.checked = true; }
        const e = byValue.get(row.dataset.value);
        if (e?.html) desc.innerHTML = e.html;
        else desc.innerHTML = row.dataset.uuid ? await descriptionOf(row.dataset.uuid, cache) : `<h3>${esc(e?.name ?? "")}</h3>`;
      };
      // The count, the boxes past the limit, and Take only when the count allows it.
      const sync = () => {
        if (!multi) return;
        const boxes = [...root.querySelectorAll("input[name=pick]")];
        const n = boxes.filter(b => b.checked).length;
        const count = root.querySelector(".arn-pick-count");
        if (count) { count.textContent = `${n} of ${many} chosen`; count.classList.toggle("short", n < many); }
        for (const b of boxes) { if (!b.checked) b.disabled = n >= many; b.closest(".arn-pick-row")?.classList.toggle("picked", b.checked); }
        if (take) take.disabled = exact ? n !== many : n === 0;
      };
      root.querySelectorAll(".arn-pick-row").forEach(r => r.addEventListener("click", () => show(r)));
      root.querySelectorAll("input[name=pick][type=checkbox]").forEach(b => b.addEventListener("change", sync));
      root.querySelector(".arn-pick-search")?.addEventListener("input", e => {
        const q = e.target.value.trim().toLowerCase();
        root.querySelectorAll(".arn-pick-row").forEach(r => { r.hidden = !!q && !r.dataset.name.includes(q); });
        root.querySelectorAll(".arn-pick-group").forEach(g => {
          let n = g.nextElementSibling, any = false;
          while (n && !n.classList.contains("arn-pick-group")) { if (!n.hidden) any = true; n = n.nextElementSibling; }
          g.hidden = !any;
        });
      });
      sync();
      // A preselected entry shows its description straight away.
      const first = pre.size ? root.querySelector(`.arn-pick-row[data-value="${CSS.escape([...pre][0])}"]`) : null;
      if (first) { show(first); first.scrollIntoView?.({ block: "nearest" }); }
    },
    buttons: [
      { action: "take", label: takeLabel, icon: "fa-solid fa-check", default: true, callback: (ev, btn) => {
        const form = btn.form;
        if (multi) return [...(form?.querySelectorAll("input[name=pick]:checked") ?? [])].map(i => i.value);
        return form?.querySelector("input[name=pick]:checked")?.value ?? "";
      } },
      { action: "later", label: laterLabel },
      ...(skipLabel ? [{ action: "skip", label: skipLabel, icon: "fa-solid fa-forward" }] : []),
      ...buttons.map(b => ({ action: b.action, label: b.label, ...(b.icon ? { icon: b.icon } : {}) }))
    ],
    rejectClose: false
  });
  const picked = multi && Array.isArray(res) ? [...new Set(res.map(String))].filter(v => byValue.has(v)).slice(0, many) : null;
  // Take with nothing chosen: say so and open it again, so the choice isn't lost.
  if (res === "" || (picked && !picked.length)) {
    ui.notifications.warn(`${multi ? "Pick at least one" : "Pick one"} first, or press ${laterLabel}.`);
    return pickFromList({ ...opts, preselect: null });
  }
  if (picked) {
    if (picked.length < many) {
      if (exact) {
        ui.notifications.warn(`Pick ${many}: ${picked.length} of ${many} chosen.`);
        return pickFromList({ ...opts, preselect: picked });
      }
      ui.notifications.warn(`${picked.length} of ${many} chosen. You can add the rest later.`);
    }
    return picked;
  }
  return res;
}

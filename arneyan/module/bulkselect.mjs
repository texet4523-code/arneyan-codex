/**
 * Select and delete many at once (Kieran, 17 Nov: "a select all actors in the actor tab ... I want them deleted").
 * Foundry's sidebar picks one document at a time, so the Actors and Items tabs get a Select button (GM): a checklist
 * by folder, with a search box, Select all (of what's shown) and None, then Delete selected after a confirmation.
 * Player characters are hidden from the Actors list unless asked for, so Select all never takes the party.
 */
const SYS = "arneyan";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/**
 * The rows the checklist shows, grouped by folder (no folder first, then folders by name), each sorted by name.
 * `docs`: [{ id, name, type, folder: { id, name } | null }]. Pure, for tests.
 */
export function bulkGroups(docs, { characters = false } = {}) {
  const groups = new Map();
  for (const d of docs) {
    if (!characters && d.type === "character") continue;
    const key = d.folder?.id ?? "";
    if (!groups.has(key)) groups.set(key, { id: key, name: d.folder?.name ?? "Not in a folder", docs: [] });
    groups.get(key).docs.push({ id: d.id, name: d.name, type: d.type });
  }
  const out = [...groups.values()];
  for (const g of out) g.docs.sort((a, b) => a.name.localeCompare(b.name));
  return out.sort((a, b) => (a.id === "" ? -1 : b.id === "" ? 1 : a.name.localeCompare(b.name)));
}

/** The confirmation's list: up to `max` names, then "and N more". Pure, for tests. */
export function namesLine(names, max = 12) {
  const list = names.slice(0, max).join(", ");
  return names.length > max ? `${list} and ${names.length - max} more` : list;
}

/** The checklist for a collection ("Actor" or "Item"). */
export async function bulkSelect(documentName = "Actor") {
  if (!game.user.isGM) return ui.notifications.warn("Selecting many at once is for the GM.");
  const cls = CONFIG[documentName].documentClass;
  const collection = game.collections.get(documentName);
  const label = documentName === "Actor" ? "actor" : "item";
  const isActors = documentName === "Actor";
  const content = `<div class="arn-bulk">
    <div class="arn-bulk-bar">
      <input type="search" class="arn-bulk-search" placeholder="Search names">
      <button type="button" class="arn-bulk-all"><i class="fa-solid fa-check-double"></i> Select all</button>
      <button type="button" class="arn-bulk-none"><i class="fa-regular fa-square"></i> None</button>
    </div>
    ${isActors ? `<label class="arn-bulk-pcs"><input type="checkbox" class="arn-bulk-chars"> Show player characters</label>` : ""}
    <div class="arn-bulk-list"></div>
    <p class="arn-bulk-count arn-muted">None selected.</p>
  </div>`;
  let characters = false;
  const draw = root => {
    const list = root.querySelector(".arn-bulk-list");
    const picked = new Set([...root.querySelectorAll(".arn-bulk-list input:checked")].map(i => i.value));
    const groups = bulkGroups(collection.contents.map(d => ({ id: d.id, name: d.name, type: d.type, folder: d.folder ? { id: d.folder.id, name: d.folder.name } : null })), { characters });
    list.innerHTML = groups.length ? groups.map(g => `<fieldset class="arn-bulk-group"><legend><label><input type="checkbox" class="arn-bulk-folder" data-folder="${esc(g.id)}"> ${esc(g.name)} <span class="arn-muted">(${g.docs.length})</span></label></legend>
      ${g.docs.map(d => `<label class="arn-bulk-row" data-name="${esc(d.name.toLowerCase())}"><input type="checkbox" value="${esc(d.id)}" data-folder="${esc(g.id)}" ${picked.has(d.id) ? "checked" : ""}> ${esc(d.name)}</label>`).join("")}</fieldset>`).join("")
      : `<p class="arn-muted">Nothing here.</p>`;
    filter(root);
  };
  const filter = root => {
    const q = String(root.querySelector(".arn-bulk-search")?.value ?? "").trim().toLowerCase();
    for (const row of root.querySelectorAll(".arn-bulk-row")) row.hidden = !!q && !row.dataset.name.includes(q);
    for (const g of root.querySelectorAll(".arn-bulk-group")) g.hidden = ![...g.querySelectorAll(".arn-bulk-row")].some(r => !r.hidden);
    count(root);
  };
  const count = root => {
    const n = root.querySelectorAll(".arn-bulk-list input[value]:checked").length;
    root.querySelector(".arn-bulk-count").textContent = n ? `${n} ${label}${n === 1 ? "" : "s"} selected.` : "None selected.";
  };
  const ids = await foundry.applications.api.DialogV2.wait({
    window: { title: `Select ${label}s`, icon: "fa-solid fa-list-check" }, classes: ["arneyan", "arn-bulk-app"], position: { width: 440, height: 620 },
    content,
    buttons: [
      { action: "delete", label: "Delete selected", icon: "fa-solid fa-trash", callback: (ev, btn) => [...btn.form.querySelectorAll(".arn-bulk-list input[value]:checked")].map(i => i.value) },
      { action: "cancel", label: "Close", default: true }
    ],
    render: (ev, dialog) => {
      const root = dialog.element ?? ev?.target?.element;
      if (!root) return;
      draw(root);
      root.querySelector(".arn-bulk-search")?.addEventListener("input", () => filter(root));
      root.querySelector(".arn-bulk-all")?.addEventListener("click", () => {
        for (const row of root.querySelectorAll(".arn-bulk-row:not([hidden]) input")) row.checked = true;
        count(root);
      });
      root.querySelector(".arn-bulk-none")?.addEventListener("click", () => {
        for (const i of root.querySelectorAll(".arn-bulk-list input")) i.checked = false;
        count(root);
      });
      root.querySelector(".arn-bulk-chars")?.addEventListener("change", ev2 => { characters = ev2.currentTarget.checked; draw(root); });
      root.querySelector(".arn-bulk-list")?.addEventListener("change", ev2 => {
        const box = ev2.target;
        // A folder's box ticks or clears every row of it that the search shows.
        if (box.classList.contains("arn-bulk-folder")) {
          for (const i of root.querySelectorAll(`.arn-bulk-row:not([hidden]) input[data-folder="${CSS.escape(box.dataset.folder)}"]`)) i.checked = box.checked;
        }
        count(root);
      });
    },
    rejectClose: false
  }).catch(() => null);
  if (!Array.isArray(ids) || !ids.length) return 0;
  const docs = ids.map(id => collection.get(id)).filter(Boolean);
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: `Delete ${docs.length} ${label}${docs.length === 1 ? "" : "s"}?`, icon: "fa-solid fa-trash" },
    content: `<p>Delete <strong>${docs.length}</strong> ${label}${docs.length === 1 ? "" : "s"} from this world? This can't be undone.</p><p class="arn-muted">${esc(namesLine(docs.map(d => d.name)))}</p>`
      + (isActors ? `<p class="arn-muted">Their tokens already on scenes stay where they are, as when you delete one by hand.</p>` : ""),
    rejectClose: false
  }).catch(() => false);
  if (!ok) return 0;
  await cls.deleteDocuments(docs.map(d => d.id));
  ui.notifications.info(`Deleted ${docs.length} ${label}${docs.length === 1 ? "" : "s"}.`);
  return docs.length;
}

/** The Select button in the Actors and Items tabs (GM). */
export function registerBulkSelect() {
  for (const [hook, name] of [["renderActorDirectory", "Actor"], ["renderItemDirectory", "Item"]]) {
    Hooks.on(hook, (app, html) => {
      if (!game.user.isGM) return;
      const root = html instanceof HTMLElement ? html : html?.[0];
      if (!root || root.querySelector(".arn-bulk-open")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "arn-bulk-open";
      btn.innerHTML = '<i class="fa-solid fa-list-check"></i> Select';
      btn.dataset.tooltip = `Tick many ${name === "Actor" ? "actors" : "items"} at once (Select all, a search, by folder) and delete them together.`;
      btn.addEventListener("click", () => bulkSelect(name));
      (root.querySelector(".header-actions, .directory-header") ?? root).append(btn);
    });
  }
  game.arneyan ??= {};
  game.arneyan.bulkSelect = bulkSelect;
}

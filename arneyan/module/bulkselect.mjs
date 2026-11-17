/**
 * Select and delete many at once (Kieran, 17 Nov: "a select all actors in the actor tab ... I want them deleted").
 * Foundry's sidebar picks one document at a time, so the Actors and Items tabs get a Select button (GM): a checklist
 * by folder, with a search box, Select all (of what's shown) and None, then Delete selected after a confirmation.
 * The party is hidden from the Actors list unless asked for, so Select all never takes it: player characters, The
 * Party and storage actors, and everything in the party's folder (its allies, mounts and pets too), except its
 * Summoned and Transformed folders.
 */
const SYS = "arneyan";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Actor types that belong to the party, hidden unless asked for. */
export const PARTY_TYPES = new Set(["character", "party", "storage"]);

/**
 * The rows the checklist shows, grouped by folder (no folder first, then folders by name), each sorted by name.
 * `docs`: [{ id, name, type, folder: { id, name } | null, party?: true }] (`party`: in the party's folder, at any depth;
 * `name` is the folder's path, "Monsters / Goblins"). Pure, for tests.
 */
export function bulkGroups(docs, { characters = false } = {}) {
  const groups = new Map();
  for (const d of docs) {
    // A changed shape (Transformed) is listed like a summon, even one copied from a character.
    if (!characters && !d.shape && (PARTY_TYPES.has(d.type) || d.party)) continue;
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
  names = [...names];
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
  // The party's folder (and every folder inside it); a folder's name as its path, so two "Goblins" can be told apart.
  // Summoned and Transformed sit inside the party folder but aren't the party: they stay in the list.
  let partyFolder = null, workFolder = () => false;
  if (isActors) { try { const P = await import("./party.mjs"); partyFolder = P.partyFolder(); workFolder = P.inPartyWorkFolder; } catch { partyFolder = null; } }
  const inParty = f => { if (workFolder(f)) return false; for (let x = f; x; x = x.folder) if (partyFolder && x.id === partyFolder.id) return true; return false; };
  const path = f => { const parts = []; for (let x = f; x; x = x.folder) parts.unshift(x.name); return parts.join(" / "); };
  const content = `<div class="arn-bulk">
    <div class="arn-bulk-bar">
      <input type="search" class="arn-bulk-search" placeholder="Search names">
      <button type="button" class="arn-bulk-all"><i class="fa-solid fa-check-double"></i> Select all</button>
      <button type="button" class="arn-bulk-none"><i class="fa-regular fa-square"></i> None</button>
    </div>
    ${isActors ? `<label class="arn-bulk-pcs"><input type="checkbox" class="arn-bulk-chars"> Show the party (player characters, The Party, storage, and the party's folder)</label>` : ""}
    <div class="arn-bulk-list"></div>
    <p class="arn-bulk-count arn-muted">None selected.</p>
  </div>`;
  let characters = false;
  const draw = root => {
    const list = root.querySelector(".arn-bulk-list");
    const picked = new Set([...root.querySelectorAll(".arn-bulk-list input:checked")].map(i => i.value));
    const groups = bulkGroups(collection.contents.map(d => ({ id: d.id, name: d.name, type: d.type, party: isActors && inParty(d.folder), shape: isActors && !!d.flags?.[SYS]?.transform,
      folder: d.folder ? { id: d.folder.id, name: path(d.folder) } : null })), { characters });
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
    const hidden = root.querySelectorAll(".arn-bulk-row[hidden] input[value]:checked").length;
    root.querySelector(".arn-bulk-count").textContent = n ? `${n} ${label}${n === 1 ? "" : "s"} selected${hidden ? ` (${hidden} hidden by the search)` : ""}.` : "None selected.";
    // A folder's box is ticked when every row of it the search shows is (the rows it acts on).
    for (const fb of root.querySelectorAll(".arn-bulk-folder")) {
      const rows = [...root.querySelectorAll(`.arn-bulk-row:not([hidden]) input[data-folder="${CSS.escape(fb.dataset.folder)}"]`)];
      fb.checked = rows.length > 0 && rows.every(i => i.checked);
    }
  };
  const ids = await foundry.applications.api.DialogV2.wait({
    window: { title: `Select ${label}s`, icon: "fa-solid fa-list-check", resizable: true }, classes: ["arneyan", "arn-bulk-app"], position: { width: 460, height: 640 },
    content,
    buttons: [
      { action: "delete", label: "Delete selected", icon: "fa-solid fa-trash", callback: (ev, btn) => [...btn.form.querySelectorAll(".arn-bulk-list input[value]:checked")].map(i => i.value) },
      { action: "cancel", label: "Close", default: true }
    ],
    render: (ev, dialog) => {
      const root = dialog instanceof HTMLElement ? dialog : (dialog?.element ?? ev?.target?.element);
      if (!root) return;
      draw(root);
      const search = root.querySelector(".arn-bulk-search");
      search?.addEventListener("input", () => filter(root));
      // Enter in the search box would submit the dialog (closing it, or jumping to Delete): it only searches.
      search?.addEventListener("keydown", ev2 => { if (ev2.key === "Enter") { ev2.preventDefault(); ev2.stopPropagation(); } });
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
  // What was really deleted: a guard (The Party, another module) can keep one back.
  const gone = (await cls.deleteDocuments(docs.map(d => d.id)))?.length ?? 0;
  const kept = docs.length - gone;
  ui.notifications.info(`Deleted ${gone} ${label}${gone === 1 ? "" : "s"}.${kept ? ` ${kept} couldn't be deleted.` : ""}`);
  return gone;
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

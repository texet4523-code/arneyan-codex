/**
 * The system's compendiums are the books: nobody edits, empties or unlocks them in a world. Anything a GM
 * wants to change is imported into the world first (drag it into the sidebar) and changed there. A system
 * update replaces the compendiums whole, so anything removed before this guard comes back on updating.
 *
 * Also: every compendium window of the system points at the Arneyan Browser, where it can be filtered
 * (the Bestiary by Level, creature type and solo; spells by level, class and school; and so on).
 */
const SYS = "arneyan";
const LOCKED_MSG = "The Arneyan compendiums can't be changed. Drag the entry into the sidebar and change the copy.";

/** Is this document (or the document it sits in) inside one of the system's compendiums? */
export function inSystemPack(doc) {
  let d = doc;
  for (let i = 0; d && i < 6; i++, d = d.parent) {
    const pack = d.pack ?? d.compendium?.collection;
    if (typeof pack === "string") return pack.startsWith(`${SYS}.`);
  }
  return false;
}

/** The pack id a sidebar entry or compendium window refers to. */
function packIdOf(el) {
  const node = el?.[0] ?? el;
  return node?.dataset?.pack ?? node?.closest?.("[data-pack]")?.dataset?.pack ?? node?.dataset?.entryId ?? "";
}
const isSystemPackId = id => typeof id === "string" && id.startsWith(`${SYS}.`);

/** Compendium sidebar folders that hold a system compendium (the "The Arneyan Codex" and "Monsters & Treasure" folders). */
function holdsSystemPacks(folder) {
  const ids = new Set([folder.id, ...(folder.getSubfolders?.(true) ?? []).map(f => f.id)]);
  return game.packs.some(p => p.metadata.packageType === "system" && p.metadata.packageName === SYS && ids.has(p.folder?.id));
}

const PACK_TABS = { equipment: "equipment", spells: "spells", actions: "actions", feats: "feats", "class-features": "features", skills: "skills", classes: "classes", ancestries: "ancestries", kits: "kits", monsters: "monsters" };

export function registerProtection() {
  const refuse = (doc, options) => {
    if (!inSystemPack(doc) || options?.arneyanPackWrite) return;
    ui.notifications?.warn(LOCKED_MSG);
    return false;
  };
  for (const type of ["Actor", "Item", "JournalEntry", "JournalEntryPage", "ActiveEffect", "Folder", "RollTable", "TableResult", "Macro", "Scene", "Adventure", "Cards", "Playlist"]) {
    Hooks.on(`preCreate${type}`, (doc, data, options) => refuse(doc, options));
    Hooks.on(`preUpdate${type}`, (doc, changes, options) => refuse(doc, options));
    Hooks.on(`preDelete${type}`, (doc, options) => refuse(doc, options));
  }

  // The sidebar folders that hold the system's compendiums stay.
  Hooks.on("preDeleteFolder", folder => {
    if (folder.type !== "Compendium" || !holdsSystemPacks(folder)) return;
    ui.notifications?.warn("That folder holds the Arneyan compendiums, so it stays.");
    return false;
  });

  // No unlocking, deleting, migrating or clearing a system compendium from its right-click menu.
  const trim = options => {
    for (const o of options ?? []) {
      const label = `${o.name ?? ""} ${o.label ?? ""} ${o.icon ?? ""}`;
      if (!/lock|delete|trash|migrat|clear/i.test(label)) continue;
      const cond = o.condition;
      o.condition = li => !isSystemPackId(packIdOf(li)) && (typeof cond === "function" ? cond(li) : cond ?? true);
      const vis = o.visible;
      if (typeof vis === "function") o.visible = li => !isSystemPackId(packIdOf(li)) && vis(li);
    }
  };
  for (const hook of ["getCompendiumDirectoryEntryContext", "getCompendiumEntryContext"]) Hooks.on(hook, (app, options) => trim(options));

  Hooks.once("ready", async () => {
    if (!game.user.isGM) return;
    // Lock any system compendium that was unlocked in this world.
    for (const pack of game.packs.filter(p => p.metadata.packageName === SYS && p.metadata.packageType === "system" && !p.locked)) {
      await pack.configure({ locked: true }).catch(err => console.warn("Arneyan | relock", pack.collection, err));
    }
  });
  // Unlocked some other way (a module, a macro): lock it again.
  Hooks.on("updateCompendium", pack => {
    if (game.user.isGM && isSystemPackId(pack?.collection) && pack.locked === false) pack.configure({ locked: true }).catch(() => {});
  });

  // Compendium windows of the system: a bar that opens the same list in the Arneyan Browser, with filters.
  Hooks.on("renderCompendium", (app, html) => {
    const pack = app.collection ?? app.options?.collection;
    const id = pack?.collection ?? pack?.metadata?.id;
    if (!isSystemPackId(id)) return;
    const tab = PACK_TABS[id.split(".")[1]];
    const root = html instanceof HTMLElement ? html : html?.[0] ?? app.element;
    if (!tab || !root || root.querySelector(".arn-pack-bar")) return;
    const bar = document.createElement("div");
    bar.className = "arn-pack-bar";
    const what = tab === "monsters" ? "Filter by Level, creature type and solo, and add to an encounter" : "Filter and search this list";
    bar.innerHTML = `<button type="button"><i class="fa-solid fa-book-atlas"></i> ${what} in the Arneyan Browser</button><span><i class="fa-solid fa-lock"></i> Read-only: drag an entry into the sidebar to change a copy.</span>`;
    bar.querySelector("button").addEventListener("click", () => game.arneyan.browser({ tab, actor: canvas?.tokens?.controlled?.[0]?.actor ?? null }));
    const content = root.querySelector(".window-content") ?? root;
    content.prepend(bar);
  });

  // The Actors sidebar gets a Bestiary button for the GM, beside the party's.
  Hooks.on("renderActorDirectory", (app, html) => {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".arn-open-bestiary")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "arn-open-bestiary";
    btn.innerHTML = '<i class="fa-solid fa-dragon"></i> Bestiary';
    btn.dataset.tooltip = "Find monsters by Level, creature type and solo; drag them onto the map or into an encounter.";
    btn.addEventListener("click", () => game.arneyan.browser({ tab: "monsters" }));
    (root.querySelector(".header-actions, .directory-header") ?? root).append(btn);
  });
}

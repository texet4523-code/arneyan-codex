/**
 * Floors and stairs (Kieran, 16 Nov 2026: "stair tools from one map to the other ... levels to put prexisting maps that
 * have upstairs downstairs transition that is easy to use ... an option to have under map settings"). GM only.
 *
 * Foundry v14 already has the parts: a scene holds Levels (floors), each with its own picture, and a Region with a
 * Teleport Token behaviour moves a token that walks into it to another Region, on any floor or any scene. These tools
 * set them up in one go:
 * - Add a floor: a new Level above or below the scene's floors, with its picture (also from the Map Browser).
 * - Stairs: pick the area over the staircase (a Region drawn with Foundry's own Region tools) and where it leads: the
 *   same spot on another floor, another area on this map, or another map. Both ends are linked, there and back.
 *
 * Everything up to "Foundry side" is plain functions, so the tests can check it outside Foundry.
 */
const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STAIR_COLOUR = "#c9a227";
/** A floor's height when a scene's floors give none to copy (Foundry's own default Level is 0 to 20). */
const FLOOR_HEIGHT = 20;

/**
 * Where a new floor goes: above the highest floor or below the lowest, as tall as the floor next to it.
 * `levels`: [{ elevation: { bottom, top }, sort }]. Returns { elevation: { bottom, top }, sort }.
 */
export function nextFloor(levels, where = "above") {
  const list = (levels ?? []).map(l => ({ bottom: Number(l?.elevation?.bottom) || 0, top: Number(l?.elevation?.top) || 0, sort: Number(l?.sort) || 0 }));
  if (!list.length) return { elevation: { bottom: 0, top: FLOOR_HEIGHT }, sort: 0 };
  const high = list.reduce((a, b) => (b.top > a.top ? b : a)), low = list.reduce((a, b) => (b.bottom < a.bottom ? b : a));
  const tall = l => (l.top - l.bottom > 0 ? l.top - l.bottom : FLOOR_HEIGHT);
  const sorts = list.map(l => l.sort);
  return where === "below"
    ? { elevation: { bottom: low.bottom - tall(low), top: low.bottom }, sort: Math.min(...sorts) - 1 }
    : { elevation: { bottom: high.top, top: high.top + tall(high) }, sort: Math.max(...sorts) + 1 };
}

/** A stair area's Region data: a rectangle on one floor (or shapes copied from the other end). */
export function stairRegion({ name, levelId = null, shapes = null, x = 0, y = 0, width = 100, height = 100 } = {}) {
  return {
    name: String(name || "Stairs"), color: STAIR_COLOUR,
    shapes: shapes?.length ? shapes.map(s => ({ ...s })) : [{ type: "rectangle", x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }],
    ...(levelId ? { levels: [levelId] } : {}),
    flags: { [SYS]: { stairs: true } }
  };
}

/** The Teleport Token behaviour that makes a Region one end of a staircase. */
export function stairBehaviour(destinationUuid, { ask = false } = {}) {
  // v14 takes a set of destinations, v13 a single one: both are given, and each version keeps its own.
  return { type: "teleportToken", name: "Stairs", system: { destinations: [destinationUuid], destination: destinationUuid, choice: !!ask }, flags: { [SYS]: { stairs: true } } };
}

/**
 * The choices for where a staircase can lead, for the dialog: other floors of the scene (the same spot), other areas
 * on it, and every other scene (a new arrival area in its middle, or one of its areas).
 * `scene`: { id, levels: [{id, name}], regions: [{id, name, levels: [ids]}] }; `others`: scenes of the same shape with a name.
 */
export function stairTargets(scene, regionId, others = []) {
  const from = (scene.regions ?? []).find(r => r.id === regionId);
  const on = new Set(from?.levels ?? []);
  const floorName = (sc, ids) => (sc.levels ?? []).length > 1 ? ((sc.levels ?? []).filter(l => (ids ?? []).includes(l.id)).map(l => l.name).join(", ") || "every floor") : "";
  const out = [];
  for (const l of scene.levels ?? []) if (!on.has(l.id) && (scene.levels ?? []).length > 1) out.push({ value: `floor:${l.id}`, label: `The same spot on ${l.name}`, group: "This map's floors" });
  for (const r of scene.regions ?? []) if (r.id !== regionId) out.push({ value: `region:${scene.id}:${r.id}`, label: `${r.name}${floorName(scene, r.levels) ? ` (${floorName(scene, r.levels)})` : ""}`, group: "Another area on this map" });
  for (const s of others) {
    if (s.id === scene.id) continue;
    out.push({ value: `scene:${s.id}`, label: `${s.name}: a new area in the middle of the map`, group: "Another map" });
    for (const r of s.regions ?? []) out.push({ value: `region:${s.id}:${r.id}`, label: `${s.name}: ${r.name}${floorName(s, r.levels) ? ` (${floorName(s, r.levels)})` : ""}`, group: "Another map" });
  }
  return out;
}

/* -------------------------------------------- */
/*  Foundry side                                */
/* -------------------------------------------- */

const levelsOf = scene => scene?.levels?.contents ?? [];
/** Where a stairs behaviour leads (v14's set, or v13's single destination). */
const leadsTo = behaviour => [...(behaviour?.system?.destinations ?? [behaviour?.system?.destination].filter(Boolean))];
const plainScene = s => ({ id: s.id, name: s.name, levels: levelsOf(s).map(l => ({ id: l.id, name: l.name })), regions: s.regions.map(r => ({ id: r.id, name: r.name, levels: [...(r.levels ?? [])] })) });

/** Add a floor (a Level) to a scene, above or below its floors, with its picture. Returns the Level. */
export async function addFloor(scene, { name = "", src = "", where = "above" } = {}) {
  if (!scene?.levels) throw new Error("Floors need Foundry v14 or later.");
  const at = nextFloor(levelsOf(scene).map(l => ({ elevation: l.elevation, sort: l.sort })), where);
  const count = levelsOf(scene).length;
  const [level] = await scene.createEmbeddedDocuments("Level", [{ name: name || (where === "below" ? "Lower floor" : `Floor ${count + 1}`), ...at, ...(src ? { background: { src } } : {}) }]);
  return level;
}

/** Link two Regions as a staircase: each sends tokens to the other. Stairs either had before are unlinked at both ends. */
export async function linkStairs(a, b, { ask = false } = {}) {
  for (const [r, other] of [[a, b], [b, a]]) {
    const old = r.behaviors.filter(x => x.flags?.[SYS]?.stairs);
    // The ends these stairs led to before stop leading back here (the areas themselves stay, for the GM to remove).
    for (const uuid of new Set(old.flatMap(leadsTo))) {
      const was = uuid === other.uuid ? null : await fromUuid(uuid).catch(() => null);
      const back = was?.behaviors?.filter(x => x.flags?.[SYS]?.stairs && leadsTo(x).includes(r.uuid)).map(x => x.id) ?? [];
      if (back.length) await was.deleteEmbeddedDocuments("RegionBehavior", back);
    }
    if (old.length) await r.deleteEmbeddedDocuments("RegionBehavior", old.map(x => x.id));
    await r.createEmbeddedDocuments("RegionBehavior", [stairBehaviour(other.uuid, { ask })]);
  }
  return [a, b];
}

/**
 * Make a staircase from a Region to a target ("floor:<levelId>", "region:<sceneId>:<regionId>" or "scene:<sceneId>"),
 * creating the other end where it doesn't exist yet. Returns { from, to, made } (made: the other end was created).
 */
export async function makeStairs(region, target, { ask = false } = {}) {
  const scene = region.parent;
  const [kind, a, b] = String(target).split(":");
  let to = null, made = false;
  if (kind === "floor") {
    const level = scene.levels.get(a);
    if (!level) throw new Error("That floor is gone.");
    // An area on every floor (Foundry's default) would overlap its own other end: it goes on the floor being looked at.
    if (!region.levels?.size) {
      const viewed = (canvas?.scene?.id === scene.id && canvas.level?.id) || scene.initialLevel?.id || levelsOf(scene)[0]?.id;
      if (!viewed || viewed === level.id) throw new Error("This area is on every floor. Look at the floor the stairs start on, then try again.");
      await region.update({ levels: [viewed] });
    }
    const here = levelsOf(scene).find(l => (region.levels ?? new Set()).has(l.id));
    [to] = await scene.createEmbeddedDocuments("Region", [stairRegion({ name: `${region.name} (from ${here?.name ?? "the other floor"})`, levelId: level.id, shapes: region.toObject().shapes })]);
    made = true;
  } else if (kind === "region") {
    to = game.scenes.get(a)?.regions.get(b);
    if (!to) throw new Error("That area is gone.");
  } else if (kind === "scene") {
    const other = game.scenes.get(a);
    if (!other) throw new Error("That map is gone.");
    const size = other.grid?.size || 100, d = other.dimensions;
    const cx = d ? d.sceneX + d.sceneWidth / 2 : (other.width || 0) / 2, cy = d ? d.sceneY + d.sceneHeight / 2 : (other.height || 0) / 2;
    const level = other.levels?.get?.(other.initialLevel?.id ?? other.initialLevel) ?? levelsOf(other)[0];
    [to] = await other.createEmbeddedDocuments("Region", [stairRegion({ name: `From ${scene.name}`, levelId: level?.id ?? null, x: Math.floor(cx / size) * size - size, y: Math.floor(cy / size) * size - size, width: size * 2, height: size * 2 })]);
    made = true;
  } else throw new Error("Choose where the stairs lead.");
  if (!to) throw new Error("The other end couldn't be made.");
  if (to === region || to.uuid === region.uuid) throw new Error("Stairs can't lead to themselves.");
  if (!region.flags?.[SYS]?.stairs) await region.update({ color: STAIR_COLOUR, [`flags.${SYS}.stairs`]: true });
  await linkStairs(region, to, { ask });
  return { from: region, to, made };
}

const sceneFor = scene => scene ?? canvas?.scene ?? game.scenes.viewed ?? null;
const gmOnly = () => (game.user.isGM ? true : (ui.notifications.warn("Floors and stairs are the GM's to set up."), false));
const groupOptions = (opts, picked = "") => {
  const groups = [...new Set(opts.map(o => o.group))];
  return groups.map(g => `<optgroup label="${esc(g)}">${opts.filter(o => o.group === g).map(o => `<option value="${esc(o.value)}"${o.value === picked ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</optgroup>`).join("");
};

/** Ask for a floor's name, picture and place, and add it. `src` and `name` can be given (the Map Browser). */
export async function addFloorDialog(scene = null, { src = "", name = "" } = {}) {
  if (!gmOnly()) return null;
  scene = sceneFor(scene);
  if (!scene) return ui.notifications.warn("Open a map first.");
  if (!scene.levels) return ui.notifications.warn("Floors need Foundry v14 or later.");
  const floors = levelsOf(scene).slice().sort((x, y) => (y.elevation?.bottom ?? 0) - (x.elevation?.bottom ?? 0));
  const content = `<p><strong>${esc(scene.name)}</strong> has ${floors.length === 1 ? "one floor" : `${floors.length} floors`}: ${floors.map(l => esc(l.name)).join(", ")}.</p>
    <div class="form-group"><label>Name</label><input type="text" name="name" value="${esc(name)}" placeholder="Upper floor" autofocus></div>
    <div class="form-group"><label>Its map</label><div class="form-fields"><input type="text" name="src" value="${esc(src)}" placeholder="A picture in your Data folder"><button type="button" data-pick><i class="fa-solid fa-file-import"></i></button></div></div>
    <div class="form-group"><label>Where</label><select name="where"><option value="above">Above the others</option><option value="below">Below the others</option></select></div>
    <p class="arn-help">The floor's map should be the same size as the others so the walls and stairs line up. Then use Stairs to join the floors.</p>`;
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Add a floor", icon: "fa-solid fa-layer-group" }, classes: ["arneyan", "arn-gm-dialog"], position: { width: 420 }, content,
    render: (event, dialog) => {
      const root = dialog.element ?? event?.target;
      root?.querySelector?.("[data-pick]")?.addEventListener("click", () => {
        const FP = foundry.applications.apps.FilePicker?.implementation ?? globalThis.FilePicker;
        new FP({ type: "imagevideo", current: root.querySelector("input[name=src]").value, callback: path => { root.querySelector("input[name=src]").value = path; } }).render(true);
      });
    },
    ok: { label: "Add the floor", icon: "fa-solid fa-plus", callback: (ev, button) => { const f = button.form.elements; return { name: f.name.value.trim(), src: f.src.value.trim(), where: f.where.value }; } },
    rejectClose: false
  }).catch(() => null);
  if (!res) return null;
  try {
    const level = await addFloor(scene, res);
    ui.notifications.info(`${scene.name}: ${level.name} added ${res.where === "below" ? "below" : "above"} the others. Switch floors from the scene's level controls.`);
    return level;
  } catch (err) { console.error("Arneyan | floors", err); ui.notifications.error("Couldn't add the floor (the console has the error)."); return null; }
}

/** Ask which area is the staircase and where it leads, then link both ends. */
export async function stairsDialog(scene = null) {
  if (!gmOnly()) return null;
  scene = sceneFor(scene);
  if (!scene) return ui.notifications.warn("Open a map first.");
  const regions = scene.regions.contents.slice().reverse();
  if (!regions.length) return ui.notifications.warn("Draw a box over the staircase first, with the Region tools on the left, then press Stairs again.");
  const picked = regions.find(r => r.id === canvas?.regions?.controlled?.[0]?.document?.id)?.id ?? regions[0].id;
  const others = game.scenes.contents.map(plainScene);
  const here = plainScene(scene);
  const floorOf = r => (here.levels.length > 1 ? ` (${here.levels.filter(l => [...(r.levels ?? [])].includes(l.id)).map(l => l.name).join(", ") || "every floor"})` : "");
  const targets = id => stairTargets(here, id, others);
  if (!targets(picked).length) return ui.notifications.warn("There's nowhere for stairs to lead yet: add a floor, draw a second area, or make another map.");
  const content = `<div class="form-group"><label>The stairs are</label><select name="region">${regions.map(r => `<option value="${r.id}"${r.id === picked ? " selected" : ""}>${esc(r.name)}${esc(floorOf(r))}${r.flags?.[SYS]?.stairs ? " · stairs already" : ""}</option>`).join("")}</select></div>
    <div class="form-group"><label>They lead to</label><select name="target">${groupOptions(targets(picked))}</select></div>
    <div class="form-group"><label><input type="checkbox" name="ask"> Ask the player before moving the token</label></div>
    <p class="arn-help">A token that walks into either end comes out at the other. "The same spot" suits floors drawn one above the other; for another map, a new arrival area is put in its middle for you to drag into place.</p>`;
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: `Stairs: ${scene.name}`, icon: "fa-solid fa-stairs" }, classes: ["arneyan", "arn-gm-dialog"], position: { width: 460 }, content,
    render: (event, dialog) => {
      const root = dialog.element ?? event?.target;
      const sel = root?.querySelector?.("select[name=region]"), tgt = root?.querySelector?.("select[name=target]");
      sel?.addEventListener("change", () => { tgt.innerHTML = groupOptions(targets(sel.value)); });
    },
    ok: { label: "Make the stairs", icon: "fa-solid fa-stairs", callback: (ev, button) => { const f = button.form.elements; return { region: f.region.value, target: f.target.value, ask: f.ask.checked }; } },
    rejectClose: false
  }).catch(() => null);
  if (!res?.target) return null;
  try {
    const region = scene.regions.get(res.region);
    const made = await makeStairs(region, res.target, { ask: res.ask });
    const where = made.to.parent.id === scene.id ? made.to.name : `${made.to.parent.name}: ${made.to.name}`;
    ui.notifications.info(`Stairs made: ${region.name} and ${where} lead to each other.${made.made && made.to.parent.id !== scene.id ? " Open that map and drag the new area into place." : ""}`);
    return made;
  } catch (err) { console.error("Arneyan | stairs", err); ui.notifications.error(`Couldn't make the stairs: ${err.message}`); return null; }
}

function sceneControls(controls) {
  if (!game.user?.isGM) return;
  const group = controls.regions ?? Object.values(controls).find(c => c?.name === "regions");
  if (!group?.tools) return;
  const n = Object.keys(group.tools).length;
  const add = (name, title, icon, fn, i) => { group.tools[name] = { name, title, icon, order: n + i, button: true, visible: true, onChange: () => fn() }; };
  add("arnStairs", "Stairs: join an area to another floor, area or map", "fa-solid fa-stairs", () => stairsDialog(), 1);
  add("arnFloor", "Add a floor to this map", "fa-solid fa-layer-group", () => addFloorDialog(), 2);
}

/** The Scenes sidebar's right-click menu (a map's settings): Add a floor, Stairs. v14 and v13 spell an entry differently. */
function sceneMenu(app, options) {
  if (!game.user?.isGM || !Array.isArray(options)) return;
  const sceneOf = li => { const d = li?.dataset ?? li?.[0]?.dataset; return game.scenes.get(d?.entryId ?? d?.sceneId); };
  const run = (fn, li) => { const scene = sceneOf(li); return scene ? fn(scene) : ui.notifications.warn("Couldn't tell which map that was: open it and use the Region tools' Stairs button."); };
  const v14 = (game.release?.generation ?? 13) >= 14;
  const entry = (text, cls, fn) => (v14
    ? { label: text, icon: cls, visible: () => game.user.isGM, onClick: (event, li) => run(fn, li) }
    : { name: text, icon: `<i class="${cls}"></i>`, condition: () => game.user.isGM, callback: li => run(fn, li) });
  options.push(entry("Add a floor", "fa-solid fa-layer-group", addFloorDialog), entry("Stairs", "fa-solid fa-stairs", stairsDialog));
}

export function registerStairs() {
  Object.assign(game.arneyan, { stairs: { addFloor, addFloorDialog, makeStairs, stairsDialog, linkStairs } });
  Hooks.on("getSceneControlButtons", sceneControls);
  Hooks.on("getSceneContextOptions", sceneMenu);
}

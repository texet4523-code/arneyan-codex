/**
 * The Map Browser (Kieran, 26 Oct 2026: "a map browser ... pick out my maps from my desktop which is in a folder ...
 * thumbnails, searchable and organised by name and type of map"). GM only, from the Scenes sidebar.
 *
 * Foundry can only show files inside its Data folder, so the maps folder is linked into Data once (README). The browser
 * scans that folder (the "Map folder" setting, "maps" by default), groups each pack folder's pictures into one map with
 * its versions (day, night, gridless...), reads the grid from a "[33x21]" in the name, and guesses each map's type from
 * its name. The GM can correct the types; that is saved per map. Small thumbnails are made the first time a map scrolls
 * into view and saved in Data/arneyan-maps/thumbs, so later visits are instant. The scan itself is saved there too.
 *
 * Everything up to "Foundry side" is plain functions of strings, so the tests can check it outside Foundry.
 */

const SYS = "arneyan";
/** Where the scan and the thumbnails are kept, inside Data. */
export const STORE = "arneyan-maps";
export const THUMBS = `${STORE}/thumbs`;
const THUMB_WIDTH = 360;
/** How long one picture may take to load for its thumbnail before it's given up on. */
const LOAD_TIMEOUT = 20000;
/** A full-size map for a new scene can be big (and the server slow): give it longer. */
const SCENE_TIMEOUT = 120000;
/** A thumbnail's download, read and decode together: a 40 MB map on a slow line needs a minute or more. */
const THUMB_TIMEOUT = 120000;

export const IMAGE = /\.(webp|png|jpe?g|gif|avif)$/i;
export const VIDEO = /\.(webm|mp4|m4v)$/i;
const MEDIA = /\.(webp|png|jpe?g|gif|avif|webm|mp4|m4v)$/i;
/**
 * Folders that hold no maps: Mac zip leftovers, hidden folders, and token, asset and prop packs wherever the word sits
 * in the name ("Mine Tokens", "Tokens & Assets", "Assets [Free]").
 */
export const SKIP_DIRS = /^__macosx$|^\.|(^|[^a-z])(assets?|tokens?|props?|tiles?|icons?|thumbs?|thumbnails?|portraits?|handouts?)([^a-z]|$)/i;
/** Files that are never maps: Mac "._x.jpg" leftovers and other hidden files. */
const SKIP_FILE = /^\./;
/** A pack's version folders fold into the pack: "Pack/Gridless/x.jpg" is the Gridless version of Pack. */
export const VARIANT_DIR = /^(grid(ded|less)?|no[\s_-]?grid|with(out)?[\s_-]?grid|day|night|dusk|dawn|animated|animation|videos?|stills?|hd|4k|uhd|1080p|print|vtt|jpe?g|png|webp|webm|mp4|variants?|versions?|alt(ernate)?s?|extras?|bonus|original|clean|lights?|dark|winter|summer|autumn|spring|rain|fog)$/i;

/** Words too common to say a picture is named after its folder. */
const COMMON = new Set(["the", "and", "of", "map", "maps", "battle", "battlemap", "battlemaps", "pack", "collection", "part", "free", "set", "vol", "volume"]);
/** Words that only name a version of a picture. */
const VARIANT_WORD = /^(day|night|dusk|dawn|grid|gridded|gridless|nogrid|animated|static|hd|4k|uhd|light|dark|original|clean|alt|v\d+|winter|summer|autumn|spring|rain|fog|snow|interior|exterior|inside|outside|upper|lower|ground|floor|level|top|bottom|jpg|png|webp)$/i;

/** Map types, in the order the browser shows them, with the words in a name that suggest each. */
export const MAP_TYPES = [
  { key: "cave", label: "Caves & Mines", words: ["cave", "cavern", "mine", "mining", "grotto", "tunnel", "underdark", "stalactite", "chasm", "sinkhole", "lair", "nest", "den", "lava"] },
  { key: "dungeon", label: "Dungeons & Crypts", words: ["dungeon", "crypt", "tomb", "catacomb", "prison", "jail", "vault", "sewer", "labyrinth", "maze", "mausoleum", "ossuary", "treasury", "graveyard", "cemetery"] },
  { key: "tavern", label: "Taverns & Inns", words: ["tavern", "inn", "pub", "alehouse", "brewery", "saloon"] },
  { key: "town", label: "Towns & Cities", words: ["town", "village", "city", "market", "bazaar", "street", "square", "harbour", "harbor", "port", "dock", "slum", "district", "hamlet", "plaza"] },
  { key: "building", label: "Buildings & Interiors", words: ["house", "manor", "mansion", "guildhall", "guild", "shop", "library", "lab", "laboratory", "workshop", "clocktower", "tower", "observatory", "academy", "estate", "hall", "forge", "smithy", "mill", "warehouse", "bathhouse", "theatre", "theater", "arena", "school"] },
  { key: "fort", label: "Castles & Forts", words: ["castle", "keep", "fort", "fortress", "citadel", "palace", "throne", "outpost", "garrison", "barracks", "stronghold", "watchtower", "gatehouse"] },
  { key: "temple", label: "Temples & Shrines", words: ["temple", "shrine", "church", "chapel", "monastery", "cathedral", "altar", "sanctum", "sanctuary", "abbey", "stepwell", "ziggurat", "obelisk"] },
  { key: "wild", label: "Wilderness", words: ["forest", "wood", "woods", "grove", "glade", "jungle", "hill", "hills", "mountain", "canyon", "cliff", "valley", "meadow", "field", "fields", "plain", "plains", "river", "lake", "waterfall", "road", "camp", "campsite", "crossroads", "bridge", "pass", "farm", "orchard", "garden", "moor", "heath", "clearing", "trail", "ent", "tree", "pumpkin", "volcano", "volcanic"] },
  { key: "water", label: "Coast & Sea", words: ["beach", "coast", "ship", "boat", "sea", "ocean", "island", "reef", "shipwreck", "wreck", "kraken", "pirate", "lighthouse", "bay", "airship", "lagoon", "underwater", "seaside", "beached"] },
  { key: "swamp", label: "Swamps & Marshes", words: ["swamp", "bog", "marsh", "fen", "mire", "bayou", "wetland"] },
  { key: "desert", label: "Deserts", words: ["desert", "dune", "dunes", "oasis", "sand", "pyramid", "badlands", "mesa", "antlion"] },
  { key: "snow", label: "Snow & Ice", words: ["snow", "ice", "frozen", "arctic", "winter", "tundra", "glacier", "frost", "icy", "snowy"] },
  { key: "ruins", label: "Ruins", words: ["ruin", "ruins", "ruined", "abandoned", "overgrown", "ancient", "forgotten", "lost", "dig", "archaeological"] },
  { key: "planar", label: "Planes & Fey", words: ["astral", "abyss", "abyssal", "hell", "hells", "infernal", "fey", "feywild", "shadowfell", "elemental", "celestial", "plane", "planar", "ethereal", "void", "dream", "realm", "domain"] },
  { key: "battle", label: "Battlefields", words: ["battlefield", "battle", "war", "siege", "trench", "front"] }
];
export const OTHER = { key: "other", label: "Other" };
export const typeLabel = key => (MAP_TYPES.find(t => t.key === key) ?? (key === OTHER.key ? OTHER : null))?.label ?? key;
const TYPE_KEYS = new Set([...MAP_TYPES.map(t => t.key), OTHER.key]);

/** "Abandoned%20Mine" reads "Abandoned Mine"; a broken escape stays as it is. */
export function decode(s) {
  try { return decodeURIComponent(String(s ?? "")); } catch { return String(s ?? ""); }
}

/** A folder as typed or picked ("maps/battle maps"), or "" if it isn't one the browser may read (Data itself, ".."). */
export function cleanFolder(f) {
  const s = decode(f).trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return !s || s.split("/").some(part => part === ".." || part === ".") ? "" : s;
}

const GRID = /[[(]\s*(\d{1,3})\s*[x×]\s*(\d{1,3})\s*[\])]/i;
/** A grid without brackets ("Swamp Hut 30x20", "Background_91x60"): standing alone, 4 to 200 squares a side. */
const BARE_GRID = /(^|[^0-9a-z])(\d{1,3})\s?[x×]\s?(\d{1,3})(?=$|[^0-9a-z])/gi;
const squares = n => n >= 4 && n <= 200;
/** Tags in brackets that say nothing about which map it is; anything else in brackets ("(Interior)") stays. */
const TAG = /[[(]\s*(?:\d{1,3}\s*[x×]\s*\d{1,3}|various|varies|grid(?:ded|less)?|no\s*grid|4k|hd|uhd|\d+\s*(?:ppi|px|dpi)|\$\s*\d+[^\])]*)\s*[\])]/gi;

/**
 * The grid squares a name gives, and how sure: "[33x21]" is tagged; a bare "30x20" only counts at 4 to 200 squares a
 * side, so "800x600" (a picture size) and "Level 3x3 Puzzle" don't. { w, h, tagged } or null.
 */
export function gridIn(text) {
  const s = String(text ?? "");
  for (const m of s.matchAll(new RegExp(GRID.source, "gi"))) { const w = Number(m[1]), h = Number(m[2]); if (squares(w) && squares(h)) return { w, h, tagged: true }; }
  // Bare sizes: the last one that counts ("Keep 4x4 30x20" is 30 × 20; a size usually ends the name).
  let found = null;
  for (const m of s.matchAll(BARE_GRID)) { const w = Number(m[2]), h = Number(m[3]); if (squares(w) && squares(h)) found = { w, h, tagged: false }; }
  return found;
}
/** A name with its bare grid sizes taken out (only the ones that count as grids). */
const dropBareGrid = s => String(s).replace(BARE_GRID, (all, pre, w, h) => squares(Number(w)) && squares(Number(h)) ? `${pre} ` : all);

/**
 * A map's name and grid from a pack folder or file name (real names, as the scan keeps them):
 * "Abandoned Mine Entrance [33x21] - $1 Rewards" is { name: "Abandoned Mine Entrance", w: 33, h: 21 }.
 * Patreon tiers, "(Gridless)", "[Various]", grid sizes and separators go.
 */
export function parseMapName(raw) {
  const original = String(raw ?? "").replace(MEDIA, "");
  let s = original.replace(/[_]+/g, " ");
  const g = gridIn(s);
  const tier = /\$\s*\d+/.test(s);
  s = dropBareGrid(s.replace(TAG, " "))
    .replace(/\$\s*\d+\s*(?:free\s+)?(?:rewards?|tier|patrons?)?/gi, " ")
    .replace(/\bpatreon\s+rewards?\b/gi, " ")
    .replace(tier ? /\bpatreon\b/gi : /$^/, " ")
    .replace(/\s+[-–—|]+(?=\s|$)/g, " ")          // " - " separators left between words
    .replace(/^\s*[-–—|]+\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[-–—|,.\s]+$/, "")
    .trim();
  // "$1 Fey Village Rewards": with a tier, a "Rewards" left at the very end is the tier's.
  if (tier) s = s.replace(/[\s-–—|]*\brewards?$/i, "").trim();
  return { name: s || original.trim(), w: g?.w ?? null, h: g?.h ?? null };
}

/** The words of a name, lower case, apostrophes dropped ("Dragon's Lair" is "dragons lair"). */
export const wordsOf = s => String(s ?? "").toLowerCase().replace(MEDIA, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

/** The types a name suggests, in the browser's order ([] when none). A word matches with or without a plural. */
export function guessTypes(...texts) {
  const words = new Set(texts.flatMap(wordsOf).flatMap(w => [w, w.replace(/s$/, ""), w.replace(/es$/, "")]));
  return MAP_TYPES.filter(t => t.words.some(w => words.has(w))).map(t => t.key);
}

/**
 * What makes one version of a map differ from the others: its version folders and the words of its file name that
 * aren't the map's own. "Gridless/Abandoned Mine Entrance - Night.jpg" in "Abandoned Mine Entrance" is "Gridless Night".
 */
export function variantLabel(file, mapName, folders = []) {
  const own = new Set(wordsOf(mapName));
  const words = t => dropBareGrid(String(t).replace(MEDIA, "").replace(GRID, " ")).replace(/\$\s*\d+/g, " ").replace(/['’]/g, "").replace(/[_]+/g, " ")
    .split(/[^A-Za-z0-9]+/).filter(w => w && !own.has(w.toLowerCase()) && !/^\d+x\d+$/i.test(w) && !/^(rewards?|patreon)$/i.test(w));
  const seen = new Set();
  return [...folders.flatMap(words), ...words(String(file).split("/").pop())]
    .filter(w => { const k = w.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .join(" ").trim();
}

/** Cover picture first: a daytime, gridded still before night, gridless or animated versions. */
function coverScore(v) {
  const w = new Set(wordsOf(v.label));
  return (v.video ? 8 : 0) + (w.has("night") || w.has("dark") ? 4 : 0) + (w.has("gridless") || w.has("nogrid") ? 1 : 0) - (w.has("day") || w.has("original") ? 1 : 0);
}

/** A short, stable id for a file (its thumbnail's name): FNV-1a of the path. */
export function hashPath(path) {
  let h = 0x811c9dc5;
  const s = String(path);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0") + s.length.toString(36);
}
export const thumbFor = path => `${THUMBS}/${hashPath(path)}.webp`;

/**
 * The maps under a root folder from a list of file paths (as the scan keeps them: real names, not URL-encoded).
 * - The first folder under the root is a creator (root/Creator/...).
 * - A map is the folder its pictures sit in (root/Creator/Pack/x.jpg, or deeper: root/Creator/2023/Pack/x.jpg), with
 *   version folders folded in (Pack/Gridless/x.jpg is a version of Pack).
 * - A picture lying loose in a creator's folder is a map of its own, its versions in version folders beside it.
 * - A folder right under the root whose pictures are named after it is a pack with no creator (when the GM picks one
 *   creator's folder as the root).
 * `overrides`: the GM's own types, by each map's path inside the root. Returns maps sorted by name:
 * [{ key, rel, name, creator, w, h, types, guessed, variants: [{ path, label, video }], cover }].
 */
export function buildIndex(paths, root, overrides = {}) {
  const base = cleanFolder(root);
  const prefix = base ? `${base}/` : "";
  const entries = [];
  for (const raw of paths ?? []) {
    const path = String(raw);
    if (!MEDIA.test(path) || !path.startsWith(prefix)) continue;
    const dirs = path.slice(prefix.length).split("/");
    const file = dirs.pop();
    if (!file || SKIP_FILE.test(file) || dirs.some(p => SKIP_DIRS.test(p))) continue;
    const sub = [];
    while (dirs.length && VARIANT_DIR.test(dirs.at(-1).trim())) sub.unshift(dirs.pop());
    entries.push({ path, dirs, sub, file });
  }
  // Folders right under the root that hold pictures and no packs: a pack when its pictures are named after it.
  const top = new Map(), deeper = new Set();
  for (const e of entries) {
    if (e.dirs.length === 1) { if (!top.has(e.dirs[0])) top.set(e.dirs[0], []); top.get(e.dirs[0]).push(e); }
    else if (e.dirs.length > 1) deeper.add(e.dirs[0]);
  }
  const packAtTop = new Set();
  for (const [dir, list] of top) {
    if (deeper.has(dir)) continue;
    // A version of one map: once the folder's own words, version words ("Night", "Gridless") and numbers are taken
    // out, nothing is left of the file's name, and it had a folder or version word to begin with ("Day [30x30].jpg",
    // "Goblin Cave Night.webm"). "Czepeku - Old Mill.jpg" leaves "old mill": a map of its own; so does "01.jpg".
    const own = new Set(wordsOf(parseMapName(dir).name).filter(w => !COMMON.has(w)));
    const named = list.filter(e => {
      const words = wordsOf(parseMapName(e.file).name);
      const left = words.filter(w => !own.has(w) && !VARIANT_WORD.test(w) && !/^\d+$/.test(w) && !COMMON.has(w));
      return !left.length && words.some(w => own.has(w) || VARIANT_WORD.test(w));
    }).length;
    if (named * 2 > list.length) packAtTop.add(dir);
  }
  const groups = new Map();
  for (const e of entries) {
    let creator = "", packName, rel;
    if (!e.dirs.length) { packName = e.file.replace(MEDIA, ""); rel = packName; }
    else if (e.dirs.length === 1 && packAtTop.has(e.dirs[0])) { packName = e.dirs[0]; rel = e.dirs[0]; }
    else if (e.dirs.length === 1) { creator = e.dirs[0]; packName = e.file.replace(MEDIA, ""); rel = `${e.dirs[0]}/${packName}`; }
    else { creator = e.dirs[0]; packName = e.dirs.at(-1); rel = e.dirs.join("/"); }
    if (!groups.has(rel)) groups.set(rel, { rel, creator, packName, files: [] });
    groups.get(rel).files.push(e);
  }
  const maps = [];
  for (const g of groups.values()) {
    const parsed = parseMapName(g.packName);
    // A pack's grid can sit on its files instead of its folder ("Map [30x40].jpg"). A tag in brackets beats a bare size.
    const grids = [gridIn(g.packName), ...g.files.map(e => gridIn(e.file))].filter(Boolean);
    const grid = grids.find(x => x.tagged) ?? grids[0] ?? null;
    const w = grid?.w ?? null, h = grid?.h ?? null;
    let variants = g.files.map(e => ({ path: e.path, label: variantLabel(e.file, parsed.name, e.sub), video: VIDEO.test(e.path), dir: (e.sub ?? []).join("/") }));
    variants.sort((a, b) => coverScore(a) - coverScore(b) || a.path.localeCompare(b.path));
    // Every version gets a name, and no two the same. Where two clash, what tells them apart is added: the file's
    // own name, then the folder it's in, then its type (JPG, WEBP), then a number.
    if (variants.length > 1) {
      const pick = (list, make) => {
        const groups = new Map();
        for (const v of list) groups.set(v.label, [...(groups.get(v.label) ?? []), v]);
        return list.map(v => {
          const group = groups.get(v.label);
          if (group.length < 2) return v;
          const label = make(v, group);
          return label ? { ...v, label } : v;
        });
      };
      const differ = (group, f) => new Set(group.map(f)).size > 1;
      const own = v => v.path.split("/").pop().replace(MEDIA, "");
      const ext = v => (v.path.match(MEDIA)?.[1] ?? "").toUpperCase();
      variants = variants.map(v => ({ ...v, label: v.label || "Main" }));
      variants = pick(variants, (v, group) => differ(group, own) ? (v.label === "Main" ? own(v) : `${v.label} (${own(v)})`) : null);
      variants = pick(variants, (v, group) => differ(group, x => x.dir) && v.dir ? `${v.label} (${v.dir} folder)` : null);
      variants = pick(variants, (v, group) => differ(group, ext) ? (v.label === "Main" ? ext(v) : `${v.label} ${ext(v)}`) : null);
      const n = new Map();
      variants = pick(variants, v => { const k = (n.get(v.label) ?? 0) + 1; n.set(v.label, k); return `${v.label} ${k}`; });
    }
    variants = variants.map(({ dir, ...v }) => v);
    const guessed = guessTypes(parsed.name, g.packName);
    const fix = overrides?.[g.rel];
    const set = Array.isArray(fix) ? fix.filter(t => TYPE_KEYS.has(t)) : null;
    const types = set?.length ? set : (guessed.length ? guessed : [OTHER.key]);
    maps.push({ key: `${prefix}${g.rel}`, rel: g.rel, name: parsed.name, creator: g.creator, w, h, types, guessed: !set?.length, variants, cover: variants[0]?.path ?? "" });
  }
  return maps.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) || a.key.localeCompare(b.key));
}

/** The words a map is found by: its name, creator, types and version names. */
export const searchText = map => wordsOf([map.name, map.creator, ...map.types.map(typeLabel), ...map.variants.map(v => v.label)].join(" ")).join(" ");

/** Does a map match the search box? Every word must appear in its name, creator, types or version names. */
export function matches(map, query) {
  const want = wordsOf(query);
  if (!want.length) return true;
  const hay = searchText(map);
  return want.every(w => hay.includes(w));
}

/**
 * The maps in groups for the window: by type (a map with two types shows under both), by creator, or one A to Z list.
 * Returns [{ key, label, maps }].
 */
export function groupMaps(maps, by = "type") {
  if (by === "name") return maps.length ? [{ key: "", label: "", maps }] : [];
  const groups = new Map();
  const order = by === "type" ? [...MAP_TYPES.map(t => t.key), OTHER.key] : null;
  for (const m of maps) for (const k of by === "type" ? m.types : [m.creator || "Loose maps"]) {
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  const keys = [...groups.keys()].sort((a, b) => order ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b));
  return keys.map(k => ({ key: k, label: by === "type" ? typeLabel(k) : k, maps: groups.get(k) }));
}

/**
 * The grid square size in pixels for a picture whose name says it is `w` by `h` squares: the width decides; the height
 * has to agree within a square, or the name is ignored. null when it can't be told (Foundry's default then).
 */
export function gridFor(width, height, w, h) {
  if (!(width > 0 && height > 0 && w >= 4) || (h && h < 4)) return null;
  const size = Math.round(width / w);
  if (h > 0 && Math.abs(height / size - h) > 1.01) {
    // Some names give height x width.
    const flipped = Math.round(width / h);
    if (Math.abs(height / flipped - w) <= 1.01) return flipped >= 50 ? flipped : null;
    return null;
  }
  return size >= 50 ? size : null;
}

/* -------------------------------------------- */
/*  Foundry side                                */
/* -------------------------------------------- */

const FP = () => foundry.applications.apps.FilePicker.implementation;
const setting = (k, d) => { try { return game.settings.get(SYS, k) ?? d; } catch { return d; } };
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
/** A Data path (real names, as the scan keeps them) as a URL: spaces, brackets, # and % escaped, slashes kept. */
export const urlFor = path => String(path).split("/").map(encodeURIComponent).join("/");
/** A promise that gives up after ms (and calls onTimeout, to let go of whatever it was loading). */
function withTimeout(promise, ms, what, onTimeout = () => {}) {
  let timer;
  const late = new Promise((_, reject) => { timer = setTimeout(() => { onTimeout(); reject(new Error(`${what} took too long`)); }, ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** Every map file under a folder in Data, a few folders deep, six folders at a time. */
async function scanFolder(root, onProgress = () => {}) {
  const files = [];
  // Folders go back to Foundry exactly as it listed them; files are kept by their real names.
  const queue = [{ dir: root, depth: 0 }];
  let seen = 0, failed = 0, active = 0;
  const one = async ({ dir, depth }) => {
    let res;
    try { res = await FP().browse("data", dir); }
    catch (err) { failed++; console.warn(`Arneyan | maps: couldn't read ${dir}`, err); return; }
    seen++;
    for (const f of res.files ?? []) if (MEDIA.test(f)) files.push(decode(f));
    if (depth < 6) for (const d of res.dirs ?? []) {
      const leaf = decode(String(d).replace(/\/$/, "").split("/").pop());
      if (!SKIP_DIRS.test(leaf)) queue.push({ dir: d, depth: depth + 1 });
    }
    onProgress(seen, files.length);
  };
  const worker = async () => {
    while (queue.length || active) {
      if (!queue.length) { await new Promise(r => setTimeout(r, 15)); continue; }
      const job = queue.shift();
      active++;
      try { await one(job); } finally { active--; }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { files, folders: seen, failed };
}

let dirsMade = false;
/** The browser's folders in Data, made once a session. */
async function ensureStore() {
  if (dirsMade) return;
  for (const d of [STORE, THUMBS]) { try { await FP().createDirectory("data", d, {}); } catch { /* already there */ } }
  dirsMade = true;
}

/** Save a file in Data; true when Foundry says it was saved. */
async function upload(dir, name, blob) {
  const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
  const res = await FP().upload("data", dir, file, {}, { notify: false });
  return !!(res && (res.path || res.status === "success"));
}

/** The saved scan, if it is for this folder. */
async function loadScan(root) {
  try {
    const res = await fetch(`${STORE}/index.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.root === root && Array.isArray(data.files) ? data : null;
  } catch { return null; }
}

async function saveScan(data) {
  await ensureStore();
  return upload(STORE, "index.json", new Blob([JSON.stringify(data)], { type: "application/json" }));
}

/** The thumbnails already made. */
async function knownThumbs() {
  try { return new Set(((await FP().browse("data", THUMBS)).files ?? []).map(f => decode(f).split("/").pop())); }
  catch { return new Set(); }
}

/** A video's size, and a frame to draw from it (a second in, or halfway through a short one). */
function loadVideo(path, ms = LOAD_TIMEOUT) {
  const v = document.createElement("video");
  v.muted = true; v.preload = "metadata";
  const release = () => { try { v.pause(); v.removeAttribute("src"); v.load(); } catch { /* gone */ } };
  const ready = new Promise((resolve, reject) => {
    v.addEventListener("loadedmetadata", () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); }, { once: true });
    v.addEventListener("seeked", () => resolve({ el: v, width: v.videoWidth, height: v.videoHeight, release }), { once: true });
    v.addEventListener("error", () => reject(new Error(`Couldn't load ${path}`)), { once: true });
  });
  v.src = urlFor(path);
  return withTimeout(ready, ms, path).catch(err => { release(); throw err; });
}

/** A picture's size. */
function loadImage(path, ms = LOAD_TIMEOUT) {
  const img = new Image();
  img.decoding = "async";
  const ready = new Promise((resolve, reject) => {
    img.onload = () => resolve({ el: img, width: img.naturalWidth, height: img.naturalHeight, release: () => { img.src = ""; } });
    img.onerror = () => reject(new Error(`Couldn't load ${path}`));
  });
  img.src = urlFor(path);
  return withTimeout(ready, ms, path, () => { img.onload = img.onerror = null; img.src = ""; });
}

const loadMedia = (path, ms) => VIDEO.test(path) ? loadVideo(path, ms) : loadImage(path, ms);

/**
 * A map's thumbnail as a webp blob. Stills are shrunk while they're decoded (a 10,000px map isn't held full size);
 * videos give a frame.
 */
async function thumbBlob(path) {
  let source, width, height, release = () => {};
  if (!VIDEO.test(path) && typeof createImageBitmap === "function") {
    // One clock for the download, the read and the decode: a slow 40 MB map gives up rather than hanging the queue.
    const abort = new AbortController();
    let timedOut = false;
    const work = (async () => {
      const res = await fetch(urlFor(path), { signal: abort.signal });
      if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status})`);
      const b = await createImageBitmap(await res.blob(), { resizeWidth: THUMB_WIDTH, resizeQuality: "high" });
      if (timedOut) { b.close?.(); throw new Error(`${path} took too long`); }
      return b;
    })();
    work.catch(() => {});
    const bmp = await withTimeout(work, THUMB_TIMEOUT, path, () => { timedOut = true; abort.abort(); });
    source = bmp; width = bmp.width; height = bmp.height; release = () => bmp.close?.();
  } else {
    const m = await loadMedia(path);
    source = m.el; release = m.release;
    width = Math.min(THUMB_WIDTH, m.width || THUMB_WIDTH);
    height = Math.max(1, Math.round((m.height || width) * width / (m.width || width)));
  }
  try {
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(source, 0, 0, width, height);
    const blob = await new Promise(r => c.toBlob(r, "image/webp", 0.72));
    if (!blob) throw new Error("No thumbnail");
    return blob;
  } finally { release(); }
}

/** The level a v14 scene draws its map on: the one being looked at, else its first. null before levels. */
function levelOf(scene) {
  const levels = scene?.levels;
  if (!levels?.size) return null;
  const viewed = scene === canvas?.scene ? (canvas.level?.document ?? canvas.level) : null;
  return (viewed?.id && levels.get(viewed.id)) || levels.get(scene.initialLevel) || levels.contents?.[0] || null;
}

/** Put a picture on a scene as its map: the scene's background and (Foundry 14) its level's. */
async function setSceneMap(scene, path) {
  const src = urlFor(path);
  await scene.update({ "background.src": src });
  const level = levelOf(scene);
  if (level) await scene.updateEmbeddedDocuments("Level", [{ _id: level.id, "background.src": src }]);
}

/**
 * A new scene with this map, sized to the picture, its grid from the name, hidden from players until you show it.
 * Returns { scene, size } (size null when the name gave no grid that fits).
 */
export async function createMapScene(map, variant, thumbs = null) {
  const v = variant ?? map.variants[0];
  const m = await loadMedia(v.path, SCENE_TIMEOUT);
  const { width, height } = m;
  m.release?.();
  const size = gridFor(width, height, map.w, map.h);
  const name = v.label && map.variants.length > 1 ? `${map.name} (${v.label})` : map.name;
  const thumb = thumbFor(v.path);
  const data = {
    name, width, height, padding: 0, navigation: false, background: { src: urlFor(v.path) }, ...(size ? { grid: { size } } : {}),
    ...(thumbs?.has(thumb.split("/").pop()) ? { thumb } : {}), flags: { [SYS]: { map: map.key, grid: size } }
  };
  const scene = await Scene.create(data);
  await setSceneMap(scene, v.path);
  return { scene, size };
}

/* -------------------------------------------- */
/*  The window                                  */
/* -------------------------------------------- */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications?.api ?? {};

export class ArneyanMapBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;
  static open() {
    if (!game.user.isGM) return ui.notifications.warn("The Map Browser is for the GM.");
    return (ArneyanMapBrowser.#instance ??= new ArneyanMapBrowser()).render({ force: true });
  }
  /** The map folder changed (in the game settings): start again from it. */
  static reset() {
    const app = ArneyanMapBrowser.#instance;
    if (!app) return;
    app._gen++;
    app._loading = null;
    app.#setMaps(null);
    app.scan = null;
    app.query = app.typeFilter = app.creatorFilter = "";
    app.status = "";
    if (app.rendered) app.render();
  }

  constructor(options = {}) {
    super(options);
    this.maps = null;
    this._byKey = new Map();
    this.scan = null;
    this.sort = "type";
    this.query = "";
    this.typeFilter = "";
    this.creatorFilter = "";
    this.status = "";
    this._thumbs = null;
    this._urls = new Map();
    this._making = new Map();
    this._queue = [];
    this._busy = 0;
    this._loading = null;
    this._gen = 0;
    this._uploadsOff = false;
  }

  static DEFAULT_OPTIONS = {
    id: "arneyan-map-browser",
    classes: ["arneyan", "arn-maps-app"],
    position: { width: 980, height: 760 },
    window: { title: "Map Browser", icon: "fa-solid fa-map", resizable: true },
    actions: {
      newScene: ArneyanMapBrowser.#onNewScene,
      useHere: ArneyanMapBrowser.#onUseHere,
      preview: ArneyanMapBrowser.#onPreview,
      editTypes: ArneyanMapBrowser.#onEditTypes,
      rescan: ArneyanMapBrowser.#onRescan,
      pickFolder: ArneyanMapBrowser.#onPickFolder,
      setSort: ArneyanMapBrowser.#onSort,
      setType: ArneyanMapBrowser.#onType
    }
  };

  static PARTS = { main: { template: "systems/arneyan/templates/apps/maps.hbs", scrollable: [".arn-maps-results"] } };

  get root() { return cleanFolder(setting("mapRoot", "maps")) || "maps"; }

  #setMaps(maps) {
    this.maps = maps;
    this._byKey = new Map((maps ?? []).map(m => [m.key, m]));
  }

  /**
   * Load the saved scan, or scan the folder when there is none for it (or on Rescan). One at a time: the window
   * draws straight away with the progress showing, then again when the maps are in.
   */
  #load(force = false) {
    if (this._loading) return this._loading;
    const gen = this._gen, root = this.root;
    // A scan the folder has since changed under (Folder, or the setting) is thrown away.
    const stale = () => gen !== this._gen || root !== this.root;
    const status = text => { if (!stale()) this.#status(text); };
    const run = (async () => {
      try {
        let scan = force ? null : await loadScan(root);
        if (!scan) {
          status(`Scanning ${root}...`);
          const res = await scanFolder(root, (folders, files) => status(`Scanning ${root}: ${folders} folders, ${files} pictures so far...`));
          if (stale()) return;
          if (!res.folders) {
            this.scan = null;
            this.#setMaps([]);
            this.status = `Couldn't read the folder "${root}" in your Data. Link your maps folder there (see the README), or pick another folder with Folder.`;
            return;
          }
          scan = { root, scanned: Date.now(), files: res.files };
          try { if (!await saveScan(scan)) console.warn("Arneyan | maps: the scan wasn't saved"); } catch (err) { console.warn("Arneyan | maps: couldn't save the scan", err); }
        }
        const thumbs = await knownThumbs();
        if (stale()) return;
        this.scan = scan;
        this.#setMaps(buildIndex(scan.files, root, setting("mapTypes", {})));
        this._thumbs = thumbs;
        this.status = "";
      } catch (err) {
        console.error("Arneyan | maps", err);
        if (stale()) return;
        this.#setMaps([]);
        this.status = "The scan failed (the console has the error).";
      } finally { if (this._loading === run) this._loading = null; }
    })();
    this._loading = run;
    return run;
  }

  #status(text) {
    this.status = text;
    const el = this.element?.querySelector(".arn-maps-status");
    if (el) { el.textContent = text; el.hidden = !text; }
  }

  async _prepareContext() {
    // No maps yet: draw now with the progress line, and again when the scan is in.
    if (!this.maps && !this._loading) this.#load().then(() => this.rendered && this.render());
    const maps = this.maps ?? [];
    const creators = [...new Set(maps.map(m => m.creator).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const counts = {};
    for (const m of maps) for (const t of m.types) counts[t] = (counts[t] ?? 0) + 1;
    // A filter for a creator or type that isn't in the folder any more would hide everything.
    if (this.maps && this.creatorFilter && !creators.includes(this.creatorFilter)) this.creatorFilter = "";
    if (this.maps && this.typeFilter && !counts[this.typeFilter]) this.typeFilter = "";
    const types = [...MAP_TYPES, OTHER].filter(t => counts[t.key]).map(t => ({ key: t.key, label: t.label, count: counts[t.key], active: this.typeFilter === t.key }));
    const groups = groupMaps(maps, this.sort).map(g => ({
      key: g.key ?? "", label: g.label,
      maps: g.maps.map(m => ({
        key: m.key, name: m.name, creator: m.creator, grid: m.w ? `${m.w} × ${m.h}` : "",
        types: m.types.map(t => ({ key: t, label: typeLabel(t) })), guessed: m.guessed,
        variants: m.variants.map((v, i) => ({ i, label: v.label || "Main", video: v.video })),
        many: m.variants.length > 1, count: m.variants.length, video: m.variants[0]?.video,
        search: searchText(m)
      }))
    }));
    return {
      root: this.root, status: this.maps ? this.status : (this.status || `Opening ${this.root}...`), loading: !this.maps,
      total: maps.length, files: this.scan?.files?.length ?? 0,
      scanned: this.scan?.scanned ? new Date(this.scan.scanned).toLocaleString() : "",
      groups, types, creators: creators.map(c => ({ value: c, selected: c === this.creatorFilter })),
      sort: this.sort, sorts: [["type", "By type"], ["creator", "By creator"], ["name", "A to Z"]].map(([value, label]) => ({ value, label, active: value === this.sort })),
      query: this.query, allTypes: !this.typeFilter
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element;
    const search = el.querySelector("input[name=q]");
    search?.addEventListener("input", () => { this.query = search.value; this.#filter(); });
    el.querySelector("select[name=creator]")?.addEventListener("change", ev => { this.creatorFilter = ev.target.value; this.#filter(); });
    this.#filter();
    this.#observe();
  }

  /** Show only the cards that match: no redraw, so the thumbnails and the scroll stay put. */
  #filter() {
    const el = this.element;
    const q = wordsOf(this.query);
    let shown = 0;
    const seen = new Set();
    for (const group of el.querySelectorAll(".arn-maps-group")) {
      let n = 0;
      for (const card of group.querySelectorAll(".arn-map-card")) {
        const m = this._byKey.get(card.dataset.key);
        const ok = !!m && (!q.length || q.every(w => card.dataset.search.includes(w))) && (!this.typeFilter || m.types.includes(this.typeFilter)) && (!this.creatorFilter || m.creator === this.creatorFilter);
        card.hidden = !ok;
        if (ok) { n++; if (!seen.has(m.key)) { seen.add(m.key); shown++; } }
      }
      group.hidden = !n;
      const c = group.querySelector(".arn-maps-group-count");
      if (c) c.textContent = String(n);
    }
    const count = el.querySelector(".arn-maps-count");
    if (count) count.textContent = this.maps?.length ? `${shown} of ${this.maps.length} maps` : "";
  }

  /** Thumbnails load as cards scroll into view; missing ones are made two at a time. */
  #observe() {
    this._observer?.disconnect();
    // Thumbnails still waiting their turn are dropped (their cards were redrawn); the new cards ask again.
    for (const job of this._queue) { this._making.delete(job.path); job.done(undefined); }
    this._queue = [];
    const box = this.element.querySelector(".arn-maps-results");
    if (!box) return;
    this._observer = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        this._observer.unobserve(e.target);
        this.#thumb(e.target);
      }
    }, { root: box, rootMargin: "400px" });
    for (const img of this.element.querySelectorAll("img[data-thumb]")) this._observer.observe(img);
  }

  #thumb(img) {
    const m = this._byKey.get(img.dataset.thumb);
    if (!m?.cover) return;
    const path = m.cover;
    const t = thumbFor(path);
    if (this._urls.has(path)) { img.src = this._urls.get(path); return; }
    if (this._thumbs?.has(t.split("/").pop())) { img.src = t; return; }
    // Being made already (the same map under two types, or a redraw): wait for that one.
    const card = img.closest(".arn-map-card");
    if (this._making.has(path)) {
      card?.classList.add("loading");
      // A string is the thumbnail; null, a picture that wouldn't load; undefined, a turn given up by a redraw.
      this._making.get(path).then(url => { if (url && img.isConnected) img.src = url; else if (url === null) card?.classList.add("broken"); }).finally(() => card?.classList.remove("loading"));
      return;
    }
    let done;
    this._making.set(path, new Promise(r => { done = r; }));
    this._queue.push({ img, path, done });
    card?.classList.add("loading");
    this.#pump();
  }

  #pump() {
    while (this._busy < 2 && this._queue.length) {
      const { img, path, done } = this._queue.shift();
      this._busy++;
      const card = () => img.closest(".arn-map-card");
      thumbBlob(path)
        .then(async blob => {
          let url = URL.createObjectURL(blob);
          const name = thumbFor(path).split("/").pop();
          if (!this._uploadsOff) {
            try {
              await ensureStore();
              if (await upload(THUMBS, name, blob)) { this._thumbs?.add(name); URL.revokeObjectURL(url); url = thumbFor(path); }
              else this._uploadsOff = true;
            } catch (err) { this._uploadsOff = true; console.warn("Arneyan | maps: couldn't save thumbnails; they'll be made again next time", err); }
          }
          this._urls.set(path, url);
          if (img.isConnected) img.src = url;
          done(url);
        })
        .catch(err => { console.warn(`Arneyan | maps: no thumbnail for ${path}`, err); card()?.classList.add("broken"); done(null); })
        .finally(() => { this._busy--; this._making.delete(path); card()?.classList.remove("loading"); this.#pump(); });
    }
  }

  async close(options) {
    this._observer?.disconnect();
    for (const job of this._queue) { this._making.delete(job.path); job.done(undefined); }
    this._queue = [];
    return super.close(options);
  }

  /** The card's map and the version chosen in its list. */
  #picked(target) {
    const card = target.closest(".arn-map-card");
    const m = this._byKey.get(card?.dataset.key);
    if (!m) return {};
    const i = Number(card.querySelector("select[name=variant]")?.value ?? 0);
    return { map: m, variant: m.variants[i] ?? m.variants[0] };
  }

  static async #onNewScene(event, target) {
    const { map, variant } = this.#picked(target);
    if (!map) return;
    target.disabled = true;
    try {
      const { scene, size } = await createMapScene(map, variant, this._thumbs);
      ui.notifications.info(`Made the scene "${scene.name}" (${size ? `grid ${size}px from the name` : "grid not set: the name gives none that fits"}). It's hidden from players until you show it.`);
      scene.view();
    } catch (err) {
      console.error("Arneyan | maps", err);
      ui.notifications.error(`Couldn't make a scene from ${map.name} (the console has the error).`);
    } finally { target.disabled = false; }
  }

  static async #onUseHere(event, target) {
    const { map, variant } = this.#picked(target);
    const scene = canvas?.scene;
    if (!map || !scene) return ui.notifications.warn("Open a scene first: this puts the map on the scene you're looking at.");
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Use this map here" },
      content: `<p>Put <strong>${esc(map.name)}${variant?.label ? ` (${esc(variant.label)})` : ""}</strong> on <strong>${esc(scene.name)}</strong> as its map?</p><p>The scene's size, grid, walls and tokens stay as they are, so a map of another size is stretched to fit.</p>`,
      rejectClose: false
    });
    if (!ok) return;
    try { await setSceneMap(scene, variant.path); ui.notifications.info(`${scene.name} now shows ${map.name}.`); }
    catch (err) { console.error("Arneyan | maps", err); ui.notifications.error("Couldn't change the scene's map (the console has the error)."); }
  }

  static #onPreview(event, target) {
    const { map, variant } = this.#picked(target);
    if (!map) return;
    const Popout = foundry.applications.apps.ImagePopout;
    if (variant.video || !Popout) return window.open(urlFor(variant.path), "_blank");
    new Popout({ src: urlFor(variant.path), window: { title: `${map.name}${variant.label ? ` (${variant.label})` : ""}` } }).render(true);
  }

  static async #onEditTypes(event, target) {
    const { map } = this.#picked(target);
    if (!map) return;
    const boxes = [...MAP_TYPES, OTHER].map(t => `<label class="arn-maps-typebox"><input type="checkbox" name="t" value="${t.key}" ${map.types.includes(t.key) ? "checked" : ""}> ${esc(t.label)}</label>`).join("");
    const picked = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Map types: ${map.name}` },
      content: `<p>Tick what kind of map this is. It shows under each type you tick.</p><div class="arn-maps-typegrid">${boxes}</div>`,
      ok: { label: "Save", callback: (ev, button) => [...button.form.querySelectorAll("input[name=t]:checked")].map(i => i.value) },
      rejectClose: false
    });
    if (!picked) return;
    const all = foundry.utils.deepClone(setting("mapTypes", {}));
    const guessed = guessTypes(map.name, map.rel.split("/").pop());
    const same = (guessed.length ? guessed : [OTHER.key]).join() === picked.join();
    if (same || !picked.length) delete all[map.rel]; else all[map.rel] = picked;
    await game.settings.set(SYS, "mapTypes", all);
    this.#setMaps(buildIndex(this.scan?.files ?? [], this.root, all));
    this.render();
  }

  static async #onRescan() {
    if (this._loading) return;
    this.#setMaps(null);
    // Start the scan before drawing, so the draw shows its progress instead of loading the saved scan.
    const scan = this.#load(true);
    this.render();
    await scan;
    if (this.rendered) this.render();
  }

  static #onPickFolder() {
    new (FP())({
      type: "folder", activeSource: "data", current: this.root,
      callback: async (path, picker) => {
        if (picker?.activeSource && picker.activeSource !== "data") return ui.notifications.warn("Pick a folder under User Data.");
        const f = cleanFolder(path);
        if (!f) return ui.notifications.warn("Pick a folder inside Data, not Data itself.");
        await game.settings.set(SYS, "mapRoot", f);
      }
    }).render(true);
  }

  static #onSort(event, target) { this.sort = target.dataset.sort ?? "type"; this.render(); }

  static #onType(event, target) {
    this.typeFilter = this.typeFilter === target.dataset.type ? "" : (target.dataset.type ?? "");
    for (const chip of this.element.querySelectorAll(".arn-maps-types [data-type]")) chip.classList.toggle("active", chip.dataset.type === this.typeFilter && !!this.typeFilter);
    this.element.querySelector(".arn-maps-types [data-all]")?.classList.toggle("active", !this.typeFilter);
    this.#filter();
  }
}

export function registerMaps() {
  game.settings.register(SYS, "mapRoot", {
    name: "Map folder", hint: "The folder inside your Data that the Map Browser shows (link your maps folder there; see the README).",
    scope: "world", config: true, type: String, default: "maps", restricted: true,
    onChange: () => ArneyanMapBrowser.reset()
  });
  game.settings.register(SYS, "mapTypes", { scope: "world", config: false, type: Object, default: {} });
  Hooks.on("renderSceneDirectory", (app, html) => {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".arn-open-maps")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "arn-open-maps";
    btn.innerHTML = '<i class="fa-solid fa-map"></i> Map Browser';
    btn.dataset.tooltip = "Your battle maps as thumbnails: search, sort by type, make a scene in one click.";
    btn.addEventListener("click", () => ArneyanMapBrowser.open());
    (root.querySelector(".header-actions, .directory-header") ?? root).append(btn);
  });
}

/**
 * Monster art from installed art packs (0.10.27). The Bestiary's monsters come with plain icons; a GM who owns token
 * art (a token pack, a bestiary or adventure module with creature art, a free pack) can have Arneyan use it, matched
 * by name: an Ogre gets the pack's ogre token and portrait. Nothing is copied: tokens point at the images where the
 * art module installed them, so the art stays licensed to the GM's own games and never ships with the system.
 *
 * Game Settings, Monster art (GM): tick the art modules, Scan them (an index of Bestiary names to images, kept in a
 * world setting), tick "New monsters get matched art", and "Use on monsters already here" fills in the ones already
 * in the world. Only monsters still showing a system icon are changed: art set by hand stays.
 */
const SYS = "arneyan";
const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const IMAGE = /\.(webp|png|jpe?g|gif|avif|svg)$/i;
/** Words in art file names that aren't part of the creature's name ("goblin-token-01.webp"). */
const NOISE = new Set(["token", "tokens", "tok", "topdown", "top", "down", "portrait", "portraits", "art", "full", "round", "ring",
  "circle", "subject", "img", "image", "icon", "avatar", "bust", "pc", "npc", "the", "of", "a", "an", "with", "in", "on", "and", "at",
  "dnd", "dn"]);
/** Folders that hold maps, scenes, handouts and the like, not creatures: not scanned. */
const SKIP_DIRS = /^(scenes?|maps?|tiles?|handouts?|journals?|journal[-_ ]?art|items?|icons?|ui|backgrounds?|audio|sounds?|music|fonts?|scripts?|styles?|lang|packs?|templates?)$/i;
const MAX_DEPTH = 7;
/** UK and US spellings read the same ("Grey Ooze", "gray-ooze.webp"). */
const SPELLING = [[/grey/g, "gray"], [/armour/g, "armor"], [/colour/g, "color"], [/spectre/g, "specter"]];

/**
 * Other names a Bestiary monster goes by in art packs, tried after its own: what Pathfinder calls it (the remaster
 * renamed some: the Aboleth is an alghollthu master, the elementals are living whirlwinds and the like), then close kin
 * where a pack has nothing by the name (a Brown Bear gets a grizzly). Keyed by the Bestiary name, matched like names.
 */
export const ALIASES = {
  "Aboleth": ["Alghollthu Master"], "Couatl": ["Quetz Couatl"], "Erinyes": ["Erinys"], "Barbed Devil": ["Hamatula"],
  "Bearded Devil": ["Barbazu"], "Bone Devil": ["Osyluth"], "Horned Devil": ["Cornugon"], "Ice Devil": ["Gelugon"],
  "Air Elemental": ["Living Whirlwind"], "Earth Elemental": ["Living Landslide"], "Fire Elemental": ["Living Wildfire"],
  "Water Elemental": ["Living Waterfall"], "Vampire": ["Vampire Count", "Nosferatu Malefactor"], "Mummy": ["Mummy Guardian"],
  "Mummy Lord": ["Mummy Pharaoh"], "Death Knight": ["Graveknight"], "Treant": ["Arboreal Warden"],
  "Shambling Mound": ["Shambler"], "Phase Spider": ["Ether Spider"], "Dao": ["Shaitan"], "Deva": ["Astral Deva"],
  "Rakshasa": ["Raja Rakshasa"], "Flameskull": ["Flaming Skull"], "Crawling Claw": ["Crawling Hand"],
  "Sahuagin": ["Sea Devil Scout"], "Sahuagin Baron": ["Sea Devil Baron"], "Worg": ["Warg"], "Ice Troll": ["Frost Troll"],
  "Saber-toothed Tiger": ["Smilodon"], "Giant Ape": ["Megaprimatus"], "Giant Boar": ["Daeodon"], "Giant Hyena": ["Hyaenodon"],
  "Giant Crocodile": ["Deinosuchus"], "Plesiosaurus": ["Elasmosaurus"], "Giant Lizard": ["Giant Monitor Lizard"],
  "Giant Poisonous Snake": ["Giant Viper"], "Poisonous Snake": ["Viper"], "Poisonous Snake Swarm": ["Viper Swarm"],
  "Constrictor Snake": ["Ball Python"], "Giant Snake": ["Giant Anaconda"], "Giant Spider": ["Hunting Spider"],
  "Giant Wolf Spider": ["Hunting Spider"], "Killer Whale": ["Orca"], "Hunter Shark": ["Great White Shark"],
  "Giant Shark": ["Megalodon"], "Giant Sea Horse": ["Giant Seahorse"], "Quipper Swarm": ["Piranha Swarm"],
  "Shadow Dragon": ["Umbral Dragon, Adult"], "Grey Ooze, Psychic": ["Grey Ooze"], "Horse, Light": ["Riding Horse"],
  "Horse, Heavy": ["War Horse"], "Warhorse, Light": ["War Horse"], "Warhorse, Heavy": ["War Horse"], "Pony": ["Riding Pony"],
  "Warpony": ["War Pony"], "Warhorse Skeleton": ["Skeletal Horse"], "Mastiff": ["Guard Dog"], "Ape": ["Gorilla"],
  "Brown Bear": ["Grizzly Bear"], "Axe Beak": ["Terror Bird"], "Panther": ["Leopard"], "Abominable Yeti": ["Yeti"],
  "Octopus": ["Reef Octopus"], "Bat Swarm": ["Vampire Bat Swarm"], "Giant Beetle": ["Giant Stag Beetle"],
  "Giant Fire Beetle": ["Flash Beetle"], "Young Remorhaz": ["Remorhaz"], "Ankheg": ["Ankhrav"], "Bullywug": ["Boggard Warrior"],
  "Kenku": ["Tengu Sneak"], "Yuan-ti Pureblood": ["Zyss Serpentfolk"], "Yuan-ti Malison": ["Aapoph Serpentfolk"],
  "Yuan-ti Abomination": ["Aapoph Serpentfolk"], "Snapjaw Plant": ["Snapping Flytrap"], "Mud Mephit": ["Ooze Mephit"],
  "Magma Mephit": ["Fire Mephit"], "Orc War Chief": ["Orc Warchief"], "Hobgoblin Warlord": ["Hobgoblin General"],
  "Gnoll Pack Lord": ["Gnoll Sergeant"], "Lizardfolk Shaman": ["Lizardfolk Stargazer"], "Drow Elite Warrior": ["Drow Fighter"],
  "Skeleton Warrior": ["Skeleton Guard"], "Black Dragon, Wyrmling": ["Black Dragon, Young"],
  "Blue Dragon, Wyrmling": ["Blue Dragon, Young"], "Brass Dragon, Wyrmling": ["Brass Dragon, Young"],
  "Bronze Dragon, Wyrmling": ["Bronze Dragon, Young"], "Copper Dragon, Wyrmling": ["Copper Dragon, Young"],
  "Gold Dragon, Wyrmling": ["Gold Dragon, Young"], "Green Dragon, Wyrmling": ["Green Dragon, Young"],
  "Red Dragon, Wyrmling": ["Red Dragon, Young"], "Silver Dragon, Wyrmling": ["Silver Dragon, Young"],
  "White Dragon, Wyrmling": ["White Dragon, Young"],
  "Gnoll": ["Gnoll Hunter"], "Commoner": ["Villager", "Peasant"], "Town Guard": ["Guard", "City Guard"], "Bandit": ["Brigand", "Cutpurse"],
  "Thug": ["Brawler"], "Noble": ["Nobleman", "Noblewoman"], "Priest": ["Cleric"]
};
/** The 2024 Monster Manual's new names (its art is named for them), after the ones above. */
const ALIASES_2024 = {
  "Ogre Mage": ["Oni"], "Spy": ["Spy Master"], "Tribal Warrior": ["Warrior Infantry"], "Veteran": ["Warrior Veteran"], "Thug": ["Tough"],
  "Acolyte": ["Priest Acolyte"], "Cult Fanatic": ["Cultist Fanatic"], "Brigand Captain": ["Bandit Captain"],
  "Flying Sword": ["Animated Flying Sword"], "Rug of Smothering": ["Animated Rug of Smothering"], "Gas Spore": ["Gas Spore Fungus"],
  "Shrieker": ["Shrieker Fungus"], "Fire Snake": ["Salamander Fire Snake"], "Quipper": ["Piranha"], "Quipper Swarm": ["Swarm of Piranha"],
  "Spore Servant": ["Myconid Spore Servant"], "Gnoll Demon-Fang": ["Gnoll Fang of Yeenoghu"], "Half-Ogre": ["Ogrillon Ogre"],
  "Lizard King": ["Lizardfolk Sovereign"], "Sahuagin Priestess": ["Sahuagin Priest"], "Lizardfolk Shaman": ["Lizardfolk Geomancer"],
  "Poisonous Snake": ["Venomous Snake"], "Poisonous Snake Swarm": ["Swarm of Venomous Snakes"], "Giant Poisonous Snake": ["Giant Venomous Snake"],
  "Yuan-ti Pureblood": ["Yuan-ti Infiltrator"], "Tyrannosaurus": ["Tyrannosaurus Rex"], "Horse, Light": ["Horse"], "Horse, Heavy": ["Horse"],
  "Warhorse, Light": ["Warhorse"], "Warhorse, Heavy": ["Warhorse"], "Sphinx": ["Sphinx of Valor"], "Giant Elk": ["Elk"],
  "Giant Owl": ["Owl"], "Donkey": ["Mule"], "Toad": ["Frog"]
};
for (const [name, alts] of Object.entries(ALIASES_2024)) ALIASES[name] = [...(ALIASES[name] ?? []), ...alts];

/** A word as matched: singular ("goblins" and "goblin" read the same), UK and US spellings the same. */
function stem(w) {
  return w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") ? w.slice(0, -1) : w;
}

/**
 * The words to match on: lower case, no numbers or noise words ("token", "portrait"), singular. Words in brackets
 * count too ("Red Dragon (Adult)").
 */
export function nameWords(s) {
  s = String(s ?? "").toLowerCase().replace(/[()[\]]/g, " ");
  for (const [re, to] of SPELLING) s = s.replace(re, to);
  return s.replace(/[0-9]+/g, " ").replace(/[^a-z]+/g, " ").split(" ").filter(w => w.length > 1 && !NOISE.has(w)).map(stem);
}

/**
 * Words as one key, in any order: "Red Dragon, Adult", "adult-red-dragon.webp" and "dragon_red_adult.png" all read
 * "adult-dragon-red".
 */
function words(s) {
  return [...new Set(nameWords(s))].sort().join("-");
}

/** The keys a file goes by, from its name (browse paths come URL-encoded: "Red%20Dragon%2C%20Adult.webp"). */
export function fileKeys(path) {
  let s = String(path ?? "").split("/").pop().replace(IMAGE, "");
  try { s = decodeURIComponent(s); } catch { /* keep it as it is */ }
  // "mage with owl.png" is a mage, "veteran in plate armor.png" a veteran: what follows "with" or "in" isn't the creature.
  const cut = s.replace(/(^|[\s_-])(with|in)([\s_-]).*$/i, "");
  s = cut.trim() ? cut : s;
  // "ThugElfFemale" is three words, but "OwlBear" is still an owlbear: both readings.
  return [...new Set([words(s), words(s.replace(/([a-z])([A-Z])/g, "$1 $2"))].filter(Boolean))];
}
/** A file's key, as it reads with its words as written. */
export const fileKey = path => fileKeys(path)[0] ?? "";

/**
 * The keys a Bestiary name may go by, best first: the name in any word order, its aliases, and for Modrons the part
 * after the comma on its own ("Modron, Monodrone" is "monodrone"; "Adult" or "Red" alone would match anything).
 */
export function nameKeys(name) {
  const s = String(name ?? "");
  const parts = s.split(",").map(p => p.trim()).filter(Boolean);
  const aliases = Object.hasOwn(ALIASES, s) ? ALIASES[s] : [];
  // Hyphenated names run together in some files: "YuantiPureblood.webp", "WilloWisp.png".
  const joined = /[-'’]/.test(s) ? [words(s.replace(/[-'’]/g, "")), words(s.replace(/[^A-Za-z]/g, ""))] : [];
  const keys = [words(s), ...aliases.map(words), ...(parts.length === 2 && /^modrons?$/i.test(parts[0]) ? [words(parts[1])] : []), ...joined];
  return [...new Set(keys.filter(Boolean))];
}
/** The best key for a name (tests and callers that want one). */
export const artKey = name => nameKeys(name)[0] ?? "";

/** A path or folder name as typed (browse paths come URL-encoded). */
const decoded = s => { try { return decodeURIComponent(String(s ?? "")); } catch { return String(s ?? ""); } };

/**
 * Is this image a token (top-down, round) or a portrait (full art)? Judged from inside the module's folder, or the
 * scanned folder (`roots`), only: "art/dnd-tokens" mustn't make everything in it a portrait.
 */
export function artKind(path, roots = []) {
  // Browsed paths come URL-encoded ("DnD%20Tokens"), typed folders don't: both sides decoded before comparing.
  let p = decoded(path).toLowerCase();
  const root = roots.map(r => `${decoded(r).toLowerCase().replace(/\/+$/, "")}/`).filter(r => p.startsWith(r)).sort((a, b) => b.length - a.length)[0];
  p = root ? p.slice(root.length) : p.replace(/^modules\/[^/]+\//, "");
  if (/token|topdown|(^|[/_-])tok([/_.-]|$)/.test(p)) return "token";
  if (/portrait|(^|[/_-])art([/_.-]|$)|fullart|(^|[/_-])full([/_.-]|$)|(^|[/_-])bust([/_.-]|$)|avatar|(^|\/)(actors?|characters?)\//.test(p)) return "portrait";
  return "any";
}

/**
 * The index from a list of image paths: { key: { token, portrait } }. For each slot an image marked for it beats one
 * that could be either; then the shortest file name wins ("ogre.webp" over "ogre-2.webp"). `keep`: only these keys.
 */
export function indexFrom(paths, keep = null, roots = []) {
  const best = {};
  const rankFor = (slot, kind) => (kind === slot ? 2 : kind === "any" ? 1 : 0);
  for (const p of paths) {
    if (!IMAGE.test(p)) continue;
    const key = keep ? fileKeys(p).find(k => keep.has(k)) : fileKey(p);
    if (!key) continue;
    const kind = artKind(p, roots);
    const e = (best[key] ??= {});
    for (const slot of ["token", "portrait"]) {
      const r = rankFor(slot, kind);
      if (!r) continue;
      const cur = e[slot];
      const len = p.split("/").pop().length;
      if (!cur || r > cur.r || (r === cur.r && len < cur.len)) e[slot] = { p, r, len };
    }
  }
  const out = {};
  for (const [k, e] of Object.entries(best)) {
    out[k] = {};
    if (e.token) out[k].token = e.token.p;
    if (e.portrait) out[k].portrait = e.portrait.p;
  }
  return out;
}

/**
 * Art for the monsters no file is named after exactly, from files whose names hold every word of the monster's and a
 * couple more ("goblin" in "goblin_warrior_sword.webp"), but never a file named after another Bestiary monster
 * ("goblin boss" stays the Goblin Boss's). Fewest extra words win, then token or portrait as the slot wants, then the
 * shortest name. `names`: the Bestiary's names; `have`: keys that already have art. Returns { key: { token, portrait,
 * near: true } }.
 */
/**
 * The extra words a close name may have: a role, age, colour or the like ("kobold-scout" for a Kobold, "ghost-mage"
 * for a Ghost). Anything else makes another creature ("vampire-squid" is no Vampire, "goblin-dog" no Goblin).
 */
const VARIANT = new Set(["warrior", "scout", "rogue", "brute", "boss", "archer", "thug", "bombardier", "soldier", "guard",
  "captain", "mage", "priest", "cleric", "champion", "chief", "chieftain", "shaman", "sniper", "raider", "sentry", "commander",
  "leader", "lieutenant", "adept", "initiate", "fighter", "wizard", "sorcerer", "ranger", "barbarian", "druid", "bard", "warlock",
  "berserker", "skirmisher", "spearman", "swordsman", "infiltrator", "spellcaster", "male", "female", "alpha", "young", "adult",
  "elder", "old", "red", "blue", "black", "white", "green", "gold", "silver", "brass", "bronze", "copper", "gray", "brown",
  "variant", "alt", "alternate", "armed", "armored", "unarmed", "sword", "axe", "bow", "spear", "shield", "staff", "club",
  "mace", "dagger", "crossbow", "halberd", "blade", "whip", "wand", "torch", "plate", "armor", "leather",
  "robe", "cloaked", "hooded", "trained", "enraged", "angry", "angered", "feral", "roaring", "attacking",
  "handaxe", "greataxe", "greatsword", "shortsword", "longsword", "longbow", "scimitar", "flail", "hammer", "warhammer",
  // Kinds some packs put first ("demon_mezzoloth", "devil_imp"). Not "undead" or "monstrous": an undead ogre or a
  // monstrous spider is another creature than the Bestiary's Ogre or Spider.
  "demon", "devil"]);
export const NEAR_EXTRA = 2;
/**
 * Every key of every Bestiary monster, as word lists, for telling a close name from another monster's: a file with
 * "goblin", "boss" and "sword" is the Goblin Boss's, not the Goblin's, though "boss" alone would be a role.
 */
function keyWords(names) {
  return names.map(n => ({ own: new Set(nameKeys(n)), keys: nameKeys(n).map(k => k.split("-")) }));
}
/** Does the file (its words) name another monster whose name holds all of `want` and more? */
function otherMonster(fileWords, want, own, all) {
  return all.some(m => m.keys.some(k => k.length > want.length && !own.has(k.join("-"))
    && want.every(x => k.includes(x)) && k.every(x => fileWords.has(x))));
}
/** The best of some files for a slot: ones marked for it or either, then by `order`. */
function pickFor(files, slot, roots, order) {
  const rank = f => { const kind = artKind(f.p ?? f, roots); return kind === slot ? 2 : kind === "any" ? 1 : 0; };
  const fit = files.filter(f => rank(f) > 0);
  return (fit.length ? fit : files).slice().sort((a, b) => order(a, b) || (rank(b) - rank(a)))[0];
}

export function nearIndex(paths, names, have = new Set(), roots = []) {
  const files = [];
  const post = new Map();
  for (const p of paths) {
    if (!IMAGE.test(p)) continue;
    const key = fileKeys(p).at(-1);
    if (!key) continue;
    const w = new Set(key.split("-"));
    const i = files.push({ p, key, w, len: p.split("/").pop().length }) - 1;
    for (const x of w) { if (!post.has(x)) post.set(x, []); post.get(x).push(i); }
  }
  const all = keyWords(names);
  const out = {};
  names.forEach((name, n) => {
    const keys = nameKeys(name);
    if (!keys.length || keys.some(k => have.has(k))) return;
    let cands = [];
    for (const k of keys) {
      const want = k.split("-");
      const lists = want.map(x => post.get(x) ?? []).sort((a, b) => a.length - b.length);
      cands = (lists[0] ?? []).map(i => files[i]).filter(f => {
        if (!want.every(x => f.w.has(x)) || otherMonster(f.w, want, all[n].own, all)) return false;
        const extra = [...f.w].filter(x => !want.includes(x));
        return extra.length <= NEAR_EXTRA && extra.every(x => VARIANT.has(x));
      });
      if (cands.length) break;
    }
    if (!cands.length) return;
    const order = (a, b) => (a.w.size - b.w.size) || a.len - b.len;
    out[keys[0]] = { token: pickFor(cands, "token", roots, order).p, portrait: pickFor(cands, "portrait", roots, order).p, near: true };
  });
  return out;
}

/**
 * Art from a folder named after the monster, for monsters with no file by their name or a close one: packs that keep
 * each creature in its own folder ("Thug/ThugElfFemaleMelee (3).webp") or a folder per kind ("Kobolds/kobold bard.png").
 * The scanned folder or the module's own folder doesn't count. The plainest name in the folder is used.
 */
export function folderIndex(paths, names, have = new Set(), roots = []) {
  const byFolder = new Map();
  const tops = roots.map(r => decoded(r).replace(/\/+$/, "").toLowerCase());
  for (const p of paths) {
    if (!IMAGE.test(p)) continue;
    const parts = decoded(p).split("/");
    const dir = parts.slice(0, -1).join("/");
    if (parts.length < 2 || tops.includes(dir.toLowerCase()) || /^modules\/[^/]+$/i.test(dir)) continue;
    const key = words(parts[parts.length - 2]);
    if (!key) continue;
    if (!byFolder.has(key)) byFolder.set(key, []);
    byFolder.get(key).push(p);
  }
  const all = keyWords(names);
  const out = {};
  names.forEach((name, n) => {
    const keys = nameKeys(name);
    if (!keys.length || keys.some(k => have.has(k))) return;
    const k = keys.find(x => byFolder.get(x)?.length);
    if (!k) return;
    const want = k.split("-");
    // Not a file named after another monster that holds this one's name ("Wolf/dire-wolf.webp" is no Wolf).
    const files = byFolder.get(k).map(p => ({ p, w: new Set(fileKeys(p).at(-1).split("-")) }))
      .filter(f => !otherMonster(f.w, want, all[n].own, all));
    if (!files.length) return;
    // A file that names the creature first ("drakes/river-drake" for a Drake, not "drakes/wyvern"), then the plainest.
    const named = f => (want.every(x => f.w.has(x)) ? 1 : 0);
    const order = (a, b) => (named(b) - named(a)) || (a.w.size - b.w.size) || a.p.split("/").pop().length - b.p.split("/").pop().length || a.p.localeCompare(b.p);
    out[keys[0]] = { token: pickFor(files, "token", roots, order).p, portrait: pickFor(files, "portrait", roots, order).p, near: true };
  });
  return out;
}

/** The art for a monster's name, if the index has it: { token, portrait } (either may be missing). */
export function artFor(name, index = readIndex()) {
  const entries = index?.entries ?? {};
  for (const k of nameKeys(name)) if (entries[k]) return entries[k];
  return null;
}

/** Still the art it shipped with (a system or core icon), so ours may replace it. */
export function plainArt(src) {
  const s = String(src ?? "");
  return !s || s.startsWith(`systems/${SYS}/`) || s.startsWith("icons/svg/");
}

function readIndex() {
  try { return game.settings.get(SYS, "artIndex") ?? null; } catch { return null; }
}
const auto = () => { try { return !!game.settings.get(SYS, "artAuto"); } catch { return false; } };

/** Every image under a folder, a few levels deep, leaving out map, scene and handout folders. */
async function imagesUnder(path, depth = 0) {
  const FP = foundry.applications.apps.FilePicker.implementation;
  const res = await FP.browse("data", path);
  const files = (res.files ?? []).filter(f => IMAGE.test(f));
  if (depth >= MAX_DEPTH) return files;
  for (const d of res.dirs ?? []) {
    let leaf = String(d).replace(/\/$/, "").split("/").pop();
    try { leaf = decodeURIComponent(leaf); } catch { /* as it is */ }
    if (SKIP_DIRS.test(leaf)) continue;
    files.push(...await imagesUnder(d, depth + 1));
  }
  return files;
}

/** Every key the Bestiary's monsters go by (so the index keeps only art for them). */
async function bestiaryNames() {
  const pack = game.packs.get(`${SYS}.monsters`);
  return pack ? [...await pack.getIndex()].filter(e => e.type === "npc" || !e.type).map(e => e.name) : [];
}

/** A folder in the user data as typed or picked ("art/dnd-tokens"), or "" if it isn't one the scan may read. */
export function cleanFolder(f) {
  let s = String(f ?? "").trim();
  try { s = decodeURIComponent(s); } catch { /* as typed */ }
  s = s.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return !s || s.split("/").some(part => part === ".." || part === ".") ? "" : s;
}

/** A source's id in the saved order: "module:<id>" or "folder:<path>". */
export const sourceKey = (kind, id) => `${kind}:${id}`;

/**
 * The art for each monster, from sources in priority order: each of the token and the portrait comes from the first
 * source with one (its file by the name or another name the monster goes by, then a folder named after it, then a close
 * name), even when a later source has a closer name. `sources`: [{ key, paths, roots }], first wins. Returns { entries, near, missing, by }
 * with entries under each monster's own key and `by` the number of monsters each source gave.
 */
export function indexBySource(sources, names) {
  const keep = new Set(names.flatMap(n => nameKeys(n)));
  const per = sources.map(src => {
    const exact = indexFrom(src.paths, keep, src.roots ?? []);
    // A monster with only a portrait by its name may still find a token by a close name here.
    const have = new Set(Object.keys(exact).filter(k => exact[k].token));
    return { key: src.key, exact, folder: folderIndex(src.paths, names, have, src.roots ?? []), near: nearIndex(src.paths, names, have, src.roots ?? []) };
  });
  const entries = {}, by = {}, missing = [];
  let near = 0;
  for (const name of names) {
    const keys = nameKeys(name);
    // Each slot from the first source (and within it: by name, then folder, then close name) that has it.
    const found = {};
    for (const p of per) {
      const tiers = [[keys.map(k => p.exact[k]).find(Boolean), false], [p.folder[keys[0]], true], [p.near[keys[0]], true]];
      for (const [art, close] of tiers) for (const slot of ["token", "portrait"]) {
        if (art?.[slot] && !found[slot]) found[slot] = { path: art[slot], src: p.key, close };
      }
      if (found.token && found.portrait) break;
    }
    const lead = found.token ?? found.portrait;
    if (!lead) { missing.push(name); continue; }
    entries[keys[0]] = { ...(found.token ? { token: found.token.path } : {}), ...(found.portrait ? { portrait: found.portrait.path } : {}), ...(lead.close ? { near: true } : {}) };
    by[lead.src] = (by[lead.src] ?? 0) + 1;
    if (lead.close) near++;
  }
  return { entries, near, missing: missing.sort(), by };
}

/**
 * Scan the chosen art modules, and folders in the user data (a token pack downloaded as images), and keep the index
 * (GM). `order`: source keys, first wins (sources not in it go last, folders before modules as listed). Returns
 * { names, near, missing, images, empty: [module ids or folders with no images], failed: [ones that couldn't be read] }.
 */
export async function scanArt(moduleIds = [], folders = [], order = []) {
  if (!game.user.isGM) return null;
  const sources = [], empty = [], failed = [];
  folders = [...new Set(folders.map(cleanFolder).filter(Boolean))];
  moduleIds = moduleIds.filter(id => game.modules.get(id));
  const read = async (key, path, roots, label) => {
    try {
      const paths = await imagesUnder(path);
      if (!paths.length) empty.push(label);
      sources.push({ key, paths, roots });
    } catch (err) {
      console.warn(`Arneyan | art scan: ${label}`, err);
      failed.push(label);
    }
  };
  for (const f of folders) await read(sourceKey("folder", f), f, [f], f);
  for (const id of moduleIds) await read(sourceKey("module", id), `modules/${id}`, [], id);
  const rank = k => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
  sources.sort((a, b) => rank(a.key) - rank(b.key));
  const names = await bestiaryNames();
  const res = indexBySource(sources, names);
  const images = sources.reduce((n, s) => n + s.paths.length, 0);
  await game.settings.set(SYS, "artIndex", { modules: moduleIds, folders, order: sources.map(s => s.key), by: res.by, scanned: Date.now(), images,
    entries: res.entries, missing: res.missing, found: names.length - res.missing.length, near: res.near });
  return { names: names.length - res.missing.length, near: res.near, missing: res.missing.length, images, empty, failed };
}

/** The changes that give an actor (data or document) its matched art, or null when there's nothing to change. */
export function artUpdate(actor, index = readIndex()) {
  const art = artFor(actor?.name, index);
  if (!art) return null;
  const img = actor.img ?? actor._source?.img;
  const tok = actor.prototypeToken?.texture?.src ?? actor._source?.prototypeToken?.texture?.src;
  const upd = {};
  if (plainArt(img) && (art.portrait || art.token)) upd.img = art.portrait ?? art.token;
  if (plainArt(tok) && (art.token || art.portrait)) upd["prototypeToken.texture.src"] = art.token ?? art.portrait;
  return Object.keys(upd).length ? upd : null;
}

const fromBestiary = actor => {
  const src = actor?._stats?.compendiumSource ?? actor?.flags?.core?.sourceId ?? "";
  return typeof src === "string" && src.startsWith(`Compendium.${SYS}.monsters.`);
};

/** "Use on monsters already here": the world's Bestiary monsters (and their tokens on scenes) still on system icons. */
export async function applyArtToWorld() {
  if (!game.user.isGM) return 0;
  const index = readIndex();
  const updates = [];
  for (const a of game.actors) {
    if (a.type !== "npc" || !fromBestiary(a)) continue;
    const upd = artUpdate(a, index);
    if (upd) updates.push({ _id: a.id, ...upd });
  }
  if (updates.length) await Actor.updateDocuments(updates);
  // Tokens already placed (unlinked copies included) still showing a system icon.
  for (const scene of game.scenes) {
    const tu = [];
    for (const t of scene.tokens) {
      const actor = t.actor;
      if (actor?.type !== "npc" || !plainArt(t.texture?.src) || !fromBestiary(game.actors.get(t.actorId) ?? actor)) continue;
      const art = artFor(actor.name, index) ?? artFor(t.name, index);
      if (art?.token || art?.portrait) tu.push({ _id: t.id, "texture.src": art.token ?? art.portrait });
    }
    if (tu.length) await scene.updateEmbeddedDocuments("Token", tu);
  }
  return updates.length;
}

class ArneyanArtConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "arneyan-art-config",
    classes: ["arneyan", "arn-art-config"],
    window: { title: "Monster art from art packs", icon: "fa-solid fa-images", resizable: true },
    position: { width: 560, height: 760 },
    actions: { scan: ArneyanArtConfig.#onScan, apply: ArneyanArtConfig.#onApply, pickFolder: ArneyanArtConfig.#onPickFolder,
      moveUp: ArneyanArtConfig.#onMove, moveDown: ArneyanArtConfig.#onMove }
  };
  static PARTS = { main: { template: `systems/${SYS}/templates/apps/art-config.hbs`, scrollable: [".arn-art-mods"] } };

  /** A source's name as shown: a module's title, or the folder. */
  static label(key) {
    const [kind, ...rest] = String(key).split(":");
    const id = rest.join(":");
    return kind === "module" ? (game.modules.get(id)?.title ?? id) : id;
  }

  async _prepareContext() {
    const index = readIndex();
    const chosen = new Set(index?.modules ?? []);
    // Looks like an art pack: tokens, portraits, a bestiary. Not token tools (a HUD, effects, rings, vision, bars).
    const artLike = m => {
      const t = `${m.id.replace(/[-_]/g, " ")} ${m.title}`;
      // Packs say "Tokens"; tools are usually "Token Something" (Token Info Icons, Token Z).
      return /\b(tokens|art|portraits?|bestiar\w*|monsters?|creatures?)\b|caeora|forgotten/i.test(t) && !/^token\s/i.test(m.title)
        && !/\b(hud|magic|fx|rings?|vision|bars?|action|tools?|helpers?|config|animat\w*|automat\w*|variants?|tokenizer|mold|attacher)\b|tokenmagic/i.test(t);
    };
    const mods = game.modules.contents
      .map(m => ({ id: m.id, title: m.title, checked: index?.scanned ? chosen.has(m.id) : artLike(m), suggested: artLike(m) }))
      .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.title.localeCompare(b.title));
    // The priority list: the saved order, then any ticked module or folder not in it yet.
    const current = [...(index?.folders ?? []).map(f => sourceKey("folder", f)), ...mods.filter(m => m.checked).map(m => sourceKey("module", m.id))];
    const saved = (index?.order ?? []).filter(k => current.includes(k));
    const order = [...saved, ...current.filter(k => !saved.includes(k))]
      .map(key => ({ key, label: ArneyanArtConfig.label(key), count: index?.by?.[key] ?? 0 }));
    return {
      order, mods, folders: (index?.folders ?? []).join("\n"), auto: auto(), names: index?.found ?? Object.keys(index?.entries ?? {}).length, near: index?.near ?? 0, missing: index?.missing ?? [], images: index?.images ?? 0,
      scanned: index?.scanned ? new Date(index.scanned).toLocaleString() : ""
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    // The "new monsters" box saves as soon as it's ticked; changed module ticks wait for Scan, and say so.
    this.element.querySelector('input[name="auto"]')?.addEventListener("change", async ev => {
      await game.settings.set(SYS, "artAuto", ev.currentTarget.checked);
      ui.notifications.info(ev.currentTarget.checked ? "New monsters from the Bestiary get matched art." : "New monsters keep the Bestiary's icons.");
    });
    const note = this.element.querySelector(".arn-art-changed");
    for (const box of this.element.querySelectorAll('input[name="mod"], textarea[name="folders"]')) box.addEventListener("change", () => {
      note?.classList.remove("hidden");
      this.#syncOrder();
    });
  }

  /** The priority list follows the ticks and folders: new ones go to the bottom, ones taken away go. */
  #syncOrder() {
    const list = this.element.querySelector(".arn-art-order");
    if (!list) return;
    const want = [...this.#folders().map(f => sourceKey("folder", f)), ...this.#chosen().map(id => sourceKey("module", id))];
    const have = [...list.querySelectorAll("li[data-source]")];
    for (const li of have) if (!want.includes(li.dataset.source)) li.remove();
    const shown = have.map(li => li.dataset.source);
    for (const key of want.filter(k => !shown.includes(k))) {
      const li = document.createElement("li");
      li.dataset.source = key;
      const name = document.createElement("span");
      name.className = "arn-art-order-name";
      name.textContent = ArneyanArtConfig.label(key);
      li.append(name);
      li.insertAdjacentHTML("beforeend", ArneyanArtConfig.#arrows);
      list.append(li);
    }
    list.closest(".arn-art-order-box")?.classList.toggle("hidden", !want.length);
  }

  static #arrows = `<span class="arn-art-order-move"><button type="button" data-action="moveUp" data-tooltip="Higher: its art wins"><i class="fa-solid fa-arrow-up"></i></button>`
    + `<button type="button" data-action="moveDown" data-tooltip="Lower"><i class="fa-solid fa-arrow-down"></i></button></span>`;

  /** Move a source up or down the priority list (saved with the next Scan). */
  static #onMove(event, target) {
    const li = target.closest("li[data-source]");
    if (!li) return;
    if (target.dataset.action === "moveUp" && li.previousElementSibling) li.previousElementSibling.before(li);
    else if (target.dataset.action === "moveDown" && li.nextElementSibling) li.nextElementSibling.after(li);
    else return;
    this.element.querySelector(".arn-art-changed")?.classList.remove("hidden");
  }

  #order() {
    return [...this.element.querySelectorAll(".arn-art-order li[data-source]")].map(li => li.dataset.source);
  }

  #chosen() {
    return [...this.element.querySelectorAll('input[name="mod"]:checked')].map(i => i.value);
  }

  #folders() {
    return String(this.element.querySelector('textarea[name="folders"]')?.value ?? "").split(/\n+/).map(cleanFolder).filter(Boolean);
  }

  /** Pick a folder in the user data and add it to the list. */
  static #onPickFolder() {
    const FP = foundry.applications.apps.FilePicker.implementation;
    const first = this.#folders()[0];
    new FP({
      type: "folder", activeSource: "data", ...(first ? { current: first } : {}),
      callback: (path, picker) => {
        if (picker?.activeSource && picker.activeSource !== "data") return ui.notifications.warn("Pick a folder under User Data.");
        const f = cleanFolder(path);
        if (!f) return ui.notifications.warn("Pick a folder inside Data, not Data itself.");
        // Looked up now: the window may have redrawn while the picker was open.
        const box = this.element?.querySelector('textarea[name="folders"]');
        if (!box) return;
        const list = box.value.split(/\n+/).map(cleanFolder).filter(Boolean);
        if (!list.includes(f)) box.value = [...list, f].join("\n");
        this.element.querySelector(".arn-art-changed")?.classList.remove("hidden");
        this.#syncOrder();
      }
    }).render(true);
  }

  static async #onScan(event, target) {
    target.disabled = true;
    try {
      ui.notifications.info("Scanning the art packs. Big packs take a minute.");
      const res = await scanArt(this.#chosen(), this.#folders(), this.#order());
      ui.notifications.info(`Found art for ${res?.names ?? 0} Bestiary monster${res?.names === 1 ? "" : "s"} (${res?.near ?? 0} by a close name or folder; ${res?.missing ?? 0} without; ${res?.images ?? 0} images looked at).`);
      for (const id of res?.empty ?? []) ui.notifications.warn(`No images found in ${game.modules.get(id)?.title ?? id}.`);
      for (const id of res?.failed ?? []) ui.notifications.error(`Couldn't read ${game.modules.get(id)?.title ?? id} (the console has the error).`);
    } catch (err) {
      console.error("Arneyan | art scan", err);
      ui.notifications.error("The scan failed (the console has the error).");
    } finally { this.render(); }
  }

  static async #onApply(event, target) {
    target.disabled = true;
    try {
      const n = await applyArtToWorld();
      ui.notifications.info(`Matched art on ${n} monster${n === 1 ? "" : "s"} in the world, and their tokens.`);
    } catch (err) {
      console.error("Arneyan | art", err);
      ui.notifications.error("Couldn't change every monster (the console has the error).");
    } finally { this.render(); }
  }
}

export function registerArt() {
  game.settings.register(SYS, "artIndex", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(SYS, "artAuto", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.registerMenu(SYS, "artConfig", {
    name: "Monster art from art packs",
    label: "Monster art",
    hint: "Use token art and portraits from art modules you have installed, or folders of images in your Data, matched to Bestiary monsters by name. Nothing is copied.",
    icon: "fa-solid fa-images",
    type: ArneyanArtConfig,
    restricted: true
  });
  // A new monster from the Bestiary (dragged into the world, onto a scene, or placed by the Encounter Builder).
  Hooks.on("preCreateActor", (actor, data, options, userId) => {
    if (userId !== game.user.id || actor.type !== "npc" || !auto() || !fromBestiary(actor)) return;
    const upd = artUpdate(actor);
    if (upd) actor.updateSource(upd);
  });
  game.arneyan ??= {};
  game.arneyan.art = { scan: scanArt, applyToWorld: applyArtToWorld, find: name => artFor(name) };
}

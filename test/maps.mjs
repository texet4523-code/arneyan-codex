// 0.10.63: the Map Browser (arneyan/module/maps.mjs). Names are real pack names from Kieran's Battle maps folder.
import assert from "node:assert/strict";
import { hbs } from "./harness.mjs";

const M = await import("../arneyan/module/maps.mjs");
const root = new URL("../arneyan/", import.meta.url).pathname;

// Names and grids.
assert.deepEqual(M.parseMapName("Abandoned Mine Entrance [33x21] - $1 Rewards"), { name: "Abandoned Mine Entrance", w: 33, h: 21 });
assert.deepEqual(M.parseMapName("Ancient Stepwell [57x95] - $5 Rewards (Gridless) Part 1"), { name: "Ancient Stepwell Part 1", w: 57, h: 95 });
assert.deepEqual(M.parseMapName("Airships! [Various] - $1 Rewards"), { name: "Airships!", w: null, h: null });
assert.deepEqual(M.parseMapName("Ancient Battlefield $1 Rewards"), { name: "Ancient Battlefield", w: null, h: null });
assert.deepEqual(M.parseMapName("Howling Deep Tavern"), { name: "Howling Deep Tavern", w: null, h: null });
assert.deepEqual(M.parseMapName("Background_91x60.png"), { name: "Background", w: 91, h: 60 }, "a bare 91x60 is a grid too");
assert.deepEqual(M.parseMapName("Swamp Hut 30x20"), { name: "Swamp Hut", w: 30, h: 20 });
assert.deepEqual(M.parseMapName("Map 1080x1920"), { name: "Map 1080x1920", w: null, h: null }, "four digits is a screen size, not squares");
assert.deepEqual(M.parseMapName("Room 2x4you"), { name: "Room 2x4you", w: null, h: null }, "only standing alone");
assert.deepEqual(M.parseMapName(M.decode("Beached%20Kraken%20%5B78x23%5D")), { name: "Beached Kraken", w: 78, h: 23 }, "the scan decodes once; names read the same");
assert.equal(M.parseMapName("100% Dungeon [30x30]").name, "100% Dungeon", "a real % in a name isn't decoded again");
// Review 2: a bare grid is 4 to 200 squares a side, and the 4-or-more rule holds for tagged ones too.
assert.deepEqual(M.parseMapName("Level 3x3 Puzzle"), { name: "Level 3x3 Puzzle", w: null, h: null });
assert.deepEqual(M.parseMapName("Hall 800x600"), { name: "Hall 800x600", w: null, h: null });
assert.deepEqual(M.parseMapName("Token [1x1]"), { name: "Token", w: null, h: null }, "[1x1] is a tag, never 1 × 1 squares");
assert.deepEqual(M.gridIn("Pit 20x30 [40x60]"), { w: 40, h: 60, tagged: true }, "a bracketed grid beats a bare one");
// Rewards and Patreon only go beside a tier.
assert.equal(M.parseMapName("Dragon's Rewards").name, "Dragon's Rewards");
assert.equal(M.parseMapName("Fey Glade - Patreon Rewards").name, "Fey Glade");
assert.equal(M.parseMapName("Patreonville Square").name, "Patreonville Square");
assert.deepEqual(M.parseMapName("Cave (30×40).webp"), { name: "Cave", w: 30, h: 40 }, "the × sign and round brackets");
assert.equal(M.parseMapName("$1 Fey Village Rewards").name, "Fey Village");
// Review: only tags in brackets go, and "free" only as part of a tier.
assert.equal(M.parseMapName("Castle (Interior) [30x30]").name, "Castle (Interior)");
assert.equal(M.parseMapName("Free Port [40x40]").name, "Free Port");
assert.equal(M.parseMapName("Crooked Hill Free").name, "Crooked Hill Free");

// Types from names; plurals count; several types; nothing known is Other.
assert.deepEqual(M.guessTypes("Abandoned Mine Entrance"), ["cave", "ruins"]);
assert.deepEqual(M.guessTypes("Thermal Mines Pt.2"), ["cave"]);
assert.deepEqual(M.guessTypes("Howling Deep Tavern"), ["tavern"]);
assert.deepEqual(M.guessTypes("Beach Town"), ["town", "water"]);
assert.deepEqual(M.guessTypes("Banshee Moor"), ["wild"]);
assert.deepEqual(M.guessTypes("Arctic Expedition"), ["snow"]);
assert.deepEqual(M.guessTypes("Grimbrand Manor"), ["building"]);
assert.deepEqual(M.guessTypes("Astral Plane"), ["planar"]);
assert.deepEqual(M.guessTypes("Xyzzy"), []);
assert.ok(!M.guessTypes("Lairless").length, "whole words only");

// Variants: what differs between a pack's pictures.
assert.equal(M.variantLabel("maps/C/Abandoned Mine Entrance [33x21] - $1 Rewards/Abandoned Mine Entrance [33x21] - Night.jpg", "Abandoned Mine Entrance"), "Night");
assert.equal(M.variantLabel("maps/C/Pack/AbandonedMine_Gridless_Day.jpg", "Abandoned Mine"), "AbandonedMine Gridless Day");
assert.equal(M.variantLabel("maps/C/Pack/Abandoned Mine.jpg", "Abandoned Mine"), "");
assert.equal(M.variantLabel("Mine.jpg", "Mine", ["Gridless"]), "Gridless", "a version folder names the version");
assert.equal(M.variantLabel("Mine Night.jpg", "Mine", ["Night"]), "Night", "no word twice");

// The index: a pack folder is one map; loose pictures are their own; skipped folders and non-maps are left out.
const files = [
  "maps/Cze and Peku Maps/Abandoned Mine Entrance [33x21] - $1 Rewards/Abandoned Mine Entrance - Night.jpg",
  "maps/Cze and Peku Maps/Abandoned Mine Entrance [33x21] - $1 Rewards/Abandoned Mine Entrance - Day.jpg",
  "maps/Cze and Peku Maps/Abandoned Mine Entrance [33x21] - $1 Rewards/Gridless/Abandoned Mine Entrance - Day Gridless.jpg",
  "maps/Cze and Peku Maps/Abandoned Mine Entrance [33x21] - $1 Rewards/Abandoned Mine Entrance - Animated.webm",
  "maps/Cze and Peku Maps/__MACOSX/Abandoned Mine Entrance/._x.jpg",
  "maps/Cze and Peku Maps/Abandoned Mine Entrance [33x21] - $1 Rewards/._Abandoned Mine Entrance - Day.jpg",
  "maps/Cze and Peku Maps/Abandoned Mine Entrance [33x21] - $1 Rewards/Mine Tokens/miner.png",
  "maps/Caeora/Tokens & Assets/crate.png",
  "maps/Caeora/Assets/barrel.png",
  "maps/Caeora/Howling Deep Tavern/Tavern_Ground.jpg",
  "maps/Caeora/Howling Deep Tavern/notes.pdf",
  "maps/Randoms/Swamp Hut 30x20.jpg",
  "maps/Loose Crypt [20x20].png",
  "art/elsewhere.png"
];
const maps = M.buildIndex(files, "maps");
assert.deepEqual(maps.map(m => m.name), ["Abandoned Mine Entrance", "Howling Deep Tavern", "Loose Crypt", "Swamp Hut"]);
const mine = maps[0];
assert.equal(mine.creator, "Cze and Peku Maps");
assert.equal(mine.key, "maps/Cze and Peku Maps/Abandoned Mine Entrance [33x21] - $1 Rewards");
assert.deepEqual([mine.w, mine.h], [33, 21]);
assert.equal(mine.variants.length, 4, "every picture in the pack and its subfolders, not the Mac leftovers");
assert.equal(mine.cover, files[1], "a daytime still is the cover, not night or the animation");
assert.deepEqual(mine.variants.map(v => v.label), ["Day", "Gridless Day", "Night", "Animated"], "the Gridless folder names its version; Mac leftovers and token folders are left out");
assert.ok(mine.variants.at(-1).video);
assert.deepEqual(mine.types, ["cave", "ruins"]);
assert.ok(mine.guessed);
assert.equal(maps.find(m => m.name === "Loose Crypt").creator, "", "a picture in the root has no creator");
assert.deepEqual(maps.find(m => m.name === "Loose Crypt").types, ["dungeon"]);
assert.deepEqual(maps.find(m => m.name.startsWith("Swamp")).types, ["swamp"]);
assert.equal(maps.find(m => m.name.startsWith("Swamp")).variants[0].label, "", "a single picture has no version name");

// The GM's own types win, and only real type keys are kept.
assert.equal(mine.rel, "Cze and Peku Maps/Abandoned Mine Entrance [33x21] - $1 Rewards");
const fixed = M.buildIndex(files, "maps", { [mine.rel]: ["dungeon", "bogus"] });
assert.deepEqual(fixed[0].types, ["dungeon"]);
assert.equal(fixed[0].guessed, false);
// A root with a slash or in its own words reads the same.
assert.equal(M.buildIndex(files, "/maps/").length, 4);
assert.deepEqual(M.buildIndex(files, "maps", { [mine.rel]: ["bogus"] })[0].types, ["cave", "ruins"], "nothing real kept: the guess stands");

// Review: versions in look-alike folders get names that tell them apart.
const same = M.buildIndex(["maps/C/Pack [20x20]/Gridless/Mine.jpg", "maps/C/Pack [20x20]/Gridded/Mine.jpg", "maps/C/Pack [20x20]/Mine [20x20].jpg", "maps/C/Pack [20x20]/Mine [40x40].jpg"], "maps")[0];
assert.equal(new Set(same.variants.map(v => v.label)).size, 4, same.variants.map(v => v.label).join(" | "));
// Review: packs nested in a collection are their own maps; a creator's own folder picked as the root still finds packs.
const nested = M.buildIndex(["maps/C/2023 Collection/Pack A [20x20]/A.jpg", "maps/C/2023 Collection/Pack B [30x30]/B.jpg"], "maps");
assert.deepEqual(nested.map(m => [m.name, m.creator, m.w]), [["Pack A", "C", 20], ["Pack B", "C", 30]]);
const oneCreator = M.buildIndex(["maps/Cze/Mine Entrance [33x21]/Mine Entrance - Day.jpg", "maps/Cze/Mine Entrance [33x21]/Mine Entrance - Night.jpg", "maps/Cze/Hag Lair/Hag Lair.jpg"], "maps/Cze");
assert.deepEqual(oneCreator.map(m => [m.name, m.creator, m.variants.length]), [["Hag Lair", "", 1], ["Mine Entrance", "", 2]]);
// A creator's loose pictures stay one map each, with their version folders beside them.
const loose = M.buildIndex(["maps/Randoms/Swamp Hut.jpg", "maps/Randoms/Gridless/Swamp Hut.jpg", "maps/Randoms/Old Mill.jpg"], "maps");
assert.deepEqual(loose.map(m => [m.name, m.creator, m.variants.map(v => v.label).join("/")]), [["Old Mill", "Randoms", ""], ["Swamp Hut", "Randoms", "Main/Gridless"]]);
// The search reads apostrophes the same on both sides.
const lair = M.buildIndex(["maps/C/Dragon's Lair [30x30]/x.jpg"], "maps")[0];
assert.ok(M.matches(lair, "dragons lair") && M.matches(lair, "dragon's"));
assert.deepEqual(lair.types, ["cave"]);
assert.equal(M.cleanFolder("../maps"), "");
assert.equal(M.cleanFolder("Battle%20maps/"), "Battle maps");

// Search: every word, across name, creator, type and version names.
assert.ok(M.matches(mine, "mine night"));
assert.ok(M.matches(mine, "caves"));
assert.ok(M.matches(mine, "cze"));
assert.ok(!M.matches(mine, "tavern"));
assert.ok(M.matches(mine, ""));
assert.equal(M.searchText(mine).includes("caves mines"), true);

// Groups: by type a map shows under each of its types, in the browser's order; by creator; A to Z.
const byType = M.groupMaps(maps, "type");
assert.deepEqual(byType.map(g => g.label), ["Caves & Mines", "Dungeons & Crypts", "Taverns & Inns", "Swamps & Marshes", "Ruins"]);
assert.deepEqual(M.groupMaps(maps, "creator").map(g => g.label), ["Caeora", "Cze and Peku Maps", "Loose maps", "Randoms"]);
assert.equal(M.groupMaps(maps, "name")[0].maps.length, 4);
assert.deepEqual(M.groupMaps([], "name"), []);

// Grid from the picture's size and the name's squares; the height must agree, or the name may be height x width.
assert.equal(M.gridFor(4620, 2940, 33, 21), 140);
assert.equal(M.gridFor(2940, 4620, 33, 21), 140, "the name gives height x width");
assert.equal(M.gridFor(4620, 1000, 33, 21), null, "the sizes don't fit the name");
assert.equal(M.gridFor(1000, 700, 33, 21), null, "too small a square to be right");
assert.equal(M.gridFor(4620, 2940, null, null), null);
assert.equal(M.gridFor(5000, 5000, 1, 1), null, "a (1x1) tag isn't a grid");

// Thumbnails: stable names, different for different files; URLs keep slashes and escape the rest.
assert.equal(M.hashPath("a/b.jpg"), M.hashPath("a/b.jpg"));
assert.notEqual(M.hashPath("a/b.jpg"), M.hashPath("a/c.jpg"));
assert.match(M.thumbFor("maps/x.jpg"), /^arneyan-maps\/thumbs\/[0-9a-f]{8}[0-9a-z]+\.webp$/);
assert.equal(M.urlFor("maps/Cze and Peku/Mine [33x21] #2.jpg"), "maps/Cze%20and%20Peku/Mine%20%5B33x21%5D%20%232.jpg");
assert.equal(M.urlFor("maps/100% Cave.jpg"), "maps/100%25%20Cave.jpg", "the scan keeps real names, so a % is a real %");

// The window's template renders a card per map, with its versions and actions.
const render = hbs(root);
const html = render("templates/apps/maps.hbs", {
  root: "maps", total: 1, files: 4, scanned: "today", status: "", query: "", allTypes: true,
  creators: [{ value: "Cze and Peku Maps" }], sorts: [{ value: "type", label: "By type", active: true }], types: [{ key: "cave", label: "Caves & Mines", count: 1 }],
  groups: [{ label: "Caves & Mines", maps: [{ key: mine.key, name: mine.name, creator: mine.creator, grid: "33 × 21", types: [{ key: "cave", label: "Caves & Mines" }], guessed: true, many: true, count: 4, variants: mine.variants.map((v, i) => ({ i, label: v.label, video: v.video })), search: "abandoned mine" }] }]
});
assert.match(html, /data-key="maps\/Cze and Peku Maps\/Abandoned Mine Entrance \[33x21\] - \$1 Rewards"/);
assert.match(html, /data-action="newScene"/);
assert.match(html, /<option value="3">Animated \(animated\)<\/option>/);
assert.match(html, /33 × 21 squares/);
assert.ok(!/—/.test(html), "no em dashes");
const empty = render("templates/apps/maps.hbs", { root: "maps", groups: [], types: [], creators: [], sorts: [], status: "" });
assert.match(empty, /No maps found in <strong>maps<\/strong>/);

// Review 2: twins in two formats get different version names.
{
  const twins = M.buildIndex(["maps/C/Keep [30x30]/Keep.jpg", "maps/C/Keep [30x30]/Keep.webp", "maps/C/Keep [30x30]/Keep Night.jpg", "maps/C/Keep [30x30]/Night/Keep Night.jpg"], "maps");
  assert.equal(twins.length, 1);
  const labels = twins[0].variants.map(v => v.label);
  assert.equal(new Set(labels).size, labels.length, labels.join(" | "));
  // A creator folder whose files share only common words with it is not one pack.
  const cze = M.buildIndex(["maps/The Maps of Cze/Cave of Maps.jpg", "maps/The Maps of Cze/Old Mill.jpg", "maps/The Maps of Cze/Fen Hut.jpg"], "maps");
  assert.equal(cze.length, 3, cze.map(m => m.name).join(" | "));
  // ...but a top folder of Day/Night versions is.
  const top = M.buildIndex(["maps/Ruined Keep [30x30]/Day.jpg", "maps/Ruined Keep [30x30]/Night.jpg"], "maps");
  assert.deepEqual(top.map(m => [m.name, m.variants.length]), [["Ruined Keep", 2]]);
  // Tile packs aren't skipped any more.
  assert.equal(M.buildIndex(["maps/C/Dungeon Tiles/Hall [20x20].jpg"], "maps").length, 1);
}

console.log("maps: all checks pass");

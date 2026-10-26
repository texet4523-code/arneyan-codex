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
assert.deepEqual(M.parseMapName("Background_91x60.png"), { name: "Background 91x60", w: null, h: null }, "a bare 91x60 isn't a grid tag");
assert.deepEqual(M.parseMapName("Beached%20Kraken%20%5B78x23%5D"), { name: "Beached Kraken", w: 78, h: 23 }, "encoded names read the same");
assert.deepEqual(M.parseMapName("Cave (30×40).webp"), { name: "Cave", w: 30, h: 40 }, "the × sign and round brackets");
assert.equal(M.parseMapName("$1 Fey Village Rewards").name, "Fey Village");

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

// The index: a pack folder is one map; loose pictures are their own; skipped folders and non-maps are left out.
const files = [
  "maps/Cze and Peku Maps/Abandoned Mine Entrance [33x21] - $1 Rewards/Abandoned Mine Entrance - Night.jpg",
  "maps/Cze and Peku Maps/Abandoned Mine Entrance [33x21] - $1 Rewards/Abandoned Mine Entrance - Day.jpg",
  "maps/Cze and Peku Maps/Abandoned Mine Entrance [33x21] - $1 Rewards/Gridless/Abandoned Mine Entrance - Day Gridless.jpg",
  "maps/Cze and Peku Maps/Abandoned Mine Entrance [33x21] - $1 Rewards/Abandoned Mine Entrance - Animated.webm",
  "maps/Cze and Peku Maps/__MACOSX/Abandoned Mine Entrance/._x.jpg",
  "maps/Caeora/Assets/barrel.png",
  "maps/Caeora/Howling Deep Tavern/Tavern_Ground.jpg",
  "maps/Caeora/Howling Deep Tavern/notes.pdf",
  "maps/Randoms/Swamp Hut 30x20.jpg",
  "maps/Loose Crypt [20x20].png",
  "art/elsewhere.png"
];
const maps = M.buildIndex(files, "maps");
assert.deepEqual(maps.map(m => m.name), ["Abandoned Mine Entrance", "Howling Deep Tavern", "Loose Crypt", "Swamp Hut 30x20"]);
const mine = maps[0];
assert.equal(mine.creator, "Cze and Peku Maps");
assert.equal(mine.key, "maps/Cze and Peku Maps/Abandoned Mine Entrance [33x21] - $1 Rewards");
assert.deepEqual([mine.w, mine.h], [33, 21]);
assert.equal(mine.variants.length, 4, "every picture in the pack and its subfolders, not the Mac leftovers");
assert.equal(mine.cover, files[1], "a daytime still is the cover, not night or the animation");
assert.deepEqual(mine.variants.map(v => v.label), ["Day", "Day Gridless", "Night", "Animated"]);
assert.ok(mine.variants.at(-1).video);
assert.deepEqual(mine.types, ["cave", "ruins"]);
assert.ok(mine.guessed);
assert.equal(maps.find(m => m.name === "Loose Crypt").creator, "", "a picture in the root has no creator");
assert.deepEqual(maps.find(m => m.name === "Loose Crypt").types, ["dungeon"]);
assert.deepEqual(maps.find(m => m.name.startsWith("Swamp")).types, ["swamp"]);
assert.equal(maps.find(m => m.name.startsWith("Swamp")).variants[0].label, "", "a single picture has no version name");

// The GM's own types win, and only real type keys are kept.
const fixed = M.buildIndex(files, "maps", { [mine.key]: ["dungeon", "bogus"] });
assert.deepEqual(fixed[0].types, ["dungeon"]);
assert.equal(fixed[0].guessed, false);
// A root with a slash or in its own words reads the same.
assert.equal(M.buildIndex(files, "/maps/").length, 4);
assert.equal(M.cleanFolder("../maps"), "");
assert.equal(M.cleanFolder("Battle%20maps/"), "Battle maps");

// Search: every word, across name, creator, type and version names.
assert.ok(M.matches(mine, "mine night"));
assert.ok(M.matches(mine, "caves"));
assert.ok(M.matches(mine, "cze"));
assert.ok(!M.matches(mine, "tavern"));
assert.ok(M.matches(mine, ""));

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

// Thumbnails: stable names, different for different files; URLs keep slashes and escape the rest.
assert.equal(M.hashPath("a/b.jpg"), M.hashPath("a/b.jpg"));
assert.notEqual(M.hashPath("a/b.jpg"), M.hashPath("a/c.jpg"));
assert.match(M.thumbFor("maps/x.jpg"), /^arneyan-maps\/thumbs\/[0-9a-f]{8}[0-9a-z]+\.webp$/);
assert.equal(M.urlFor("maps/Cze and Peku/Mine [33x21] #2.jpg"), "maps/Cze%20and%20Peku/Mine%20%5B33x21%5D%20%232.jpg");
assert.equal(M.urlFor("maps/Already%20Encoded.jpg"), "maps/Already%20Encoded.jpg", "not encoded twice");

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

console.log("maps: all checks pass");

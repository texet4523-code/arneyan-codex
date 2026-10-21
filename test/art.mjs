// 0.10.27: monster art from installed art packs, matched by name (arneyan/module/art.mjs).
import assert from "node:assert/strict";
import fs from "node:fs";
import { hbs } from "./harness.mjs";

globalThis.CONST ??= {};
const A = await import("../arneyan/module/art.mjs");
const root = new URL("../arneyan/", import.meta.url).pathname;

// Names and file names read the same.
assert.equal(A.artKey("Red Dragon, Ancient"), A.fileKey("ancient-red-dragon.webp"));
assert.equal(A.artKey("Ogre"), A.fileKey("modules/x/tokens/ogre_token_02.webp"));
assert.equal(A.artKey("Goblin (Boss)"), "goblin");
assert.notEqual(A.artKey("Goblin"), A.fileKey("goblin-warrior.webp"), "a different creature stays different");
assert.equal(A.artKey("Owlbear"), A.fileKey("OwlBear-Portrait.png"));
// Review cases: wyrmlings keep their order, Modron names go by the part after the comma, UK spellings, encoded paths.
assert.ok(A.nameKeys("Red Dragon, Wyrmling").includes(A.fileKey("red-dragon-wyrmling.webp")));
assert.ok(A.nameKeys("Modron, Monodrone").includes(A.fileKey("monodrone.webp")));
assert.ok(!A.nameKeys("Red Dragon, Adult").includes("adult") && !A.nameKeys("Slaad, Red").includes("red"), "one word alone only for Modrons");
assert.equal(A.artKind("modules/p/creatures/robust-golem.webp"), "any", "'bust' only as a word");
assert.equal(A.artKey("Grey Ooze"), A.fileKey("gray-ooze.webp"));
assert.equal(A.artKey("Animated Armour"), A.fileKey("animated_armor.png"));
assert.equal(A.fileKey("Red%20Dragon%2C%20Adult.webp"), A.artKey("Red Dragon, Adult"));

// Token or portrait, from the path inside the module (its id doesn't count).
assert.equal(A.artKind("modules/p/tokens/bestiary/ogre.webp"), "token");
assert.equal(A.artKind("modules/p/portraits/bestiary/ogre.webp"), "portrait");
assert.equal(A.artKind("modules/p/creatures/ogre.webp"), "any");
assert.equal(A.artKind("modules/caeora-art-tokens/tokens/ogre.webp"), "token", "a module id with 'art' in it");
assert.equal(A.artKind("modules/mm/assets/actors/ogre.webp"), "portrait");
// An image marked as a token beats unmarked actor art for the token, whatever the folder order.
const off = A.indexFrom(["modules/mm/assets/actors/ogre.webp", "modules/mm/assets/tokens/ogre.webp"]);
assert.deepEqual(off.ogre, { token: "modules/mm/assets/tokens/ogre.webp", portrait: "modules/mm/assets/actors/ogre.webp" });
// Only Bestiary names are kept.
assert.deepEqual(Object.keys(A.indexFrom(["modules/q/creatures/wolf.webp", "modules/q/creatures/shadowfell-gate.webp"], new Set(["wolf"]))), ["wolf"]);

// The index: token and portrait per name, the plain file name winning over variants.
const idx = A.indexFrom([
  "modules/p/tokens/b1/ogre-2.webp", "modules/p/tokens/b1/ogre.webp", "modules/p/portraits/b1/ogre.webp",
  "modules/q/art/troll.png", "modules/q/readme.txt", "modules/q/creatures/wolf.webp"
]);
assert.deepEqual(idx.ogre, { token: "modules/p/tokens/b1/ogre.webp", portrait: "modules/p/portraits/b1/ogre.webp" });
assert.deepEqual(idx.troll, { portrait: "modules/q/art/troll.png" });
assert.deepEqual(idx.wolf, { token: "modules/q/creatures/wolf.webp", portrait: "modules/q/creatures/wolf.webp" });
assert.ok(!("readme" in idx), "not images: left out");

// What changes on a monster: only art still on a system icon.
const index = { entries: idx };
const ogre = { name: "Ogre", img: "systems/arneyan/assets/icons/monster-giant.svg", prototypeToken: { texture: { src: "systems/arneyan/assets/icons/monster-giant.svg" } } };
assert.deepEqual(A.artUpdate(ogre, index), { img: "modules/p/portraits/b1/ogre.webp", "prototypeToken.texture.src": "modules/p/tokens/b1/ogre.webp" });
const troll = { name: "Troll", img: "systems/arneyan/assets/icons/monster-troll.svg", prototypeToken: { texture: { src: "systems/arneyan/assets/icons/monster-troll.svg" } } };
assert.deepEqual(A.artUpdate(troll, index), { img: "modules/q/art/troll.png", "prototypeToken.texture.src": "modules/q/art/troll.png" }, "a portrait only: used for both");
const mine = { name: "Ogre", img: "worlds/tac/my-ogre.webp", prototypeToken: { texture: { src: "worlds/tac/my-ogre-token.webp" } } };
assert.equal(A.artUpdate(mine, index), null, "art set by hand stays");
assert.equal(A.artUpdate({ name: "Beholder", img: "systems/arneyan/x.svg", prototypeToken: { texture: { src: "" } } }, index), null, "no match: nothing");

// The settings window.
const html = hbs(root)("templates/apps/art-config.hbs", { mods: [{ id: "some-token-pack", title: "Some Token Pack", checked: true }], auto: false, names: 0, images: 0 });
assert.ok(html.includes('data-action="scan"') && html.includes('data-action="apply"') && html.includes('name="auto"') && html.includes("Some Token Pack"));
assert.ok(html.includes("arn-art-changed hidden"), "the 'press Scan' note starts hidden");
assert.ok(!html.includes("—") && !/data-action="tab"/.test(html));
assert.ok(fs.readFileSync(root + "module/arneyan.mjs", "utf8").includes("registerArt()"));
// Folders of images in the user data (a pack downloaded as plain images): judged from inside the folder, so a folder
// called "art" doesn't make every image in it a portrait; ".." never reads outside the data.
assert.equal(A.cleanFolder(" /art/dnd-tokens/ "), "art/dnd-tokens");
assert.equal(A.cleanFolder("art/../../secrets"), "");
assert.equal(A.cleanFolder(""), "");
assert.equal(A.cleanFolder("art/DnD%20Tokens/"), "art/DnD Tokens", "a picked folder comes encoded");
assert.equal(A.cleanFolder("art/%2E%2E/x"), "", "an encoded .. too");
assert.equal(A.artKind("art/DnD%20Tokens/Humanoids/goblin.png", ["art/DnD Tokens"]), "any", "a root with a space: 'Tokens' in its name doesn't count");
assert.equal(A.artKind("art/DnD%20Tokens/Portraits/goblin.png", ["art/DnD Tokens"]), "portrait");
assert.equal(A.artKind("art/dnd-tokens/Dragons/adult blue dragon.png", ["art/dnd-tokens"]), "any");
assert.equal(A.artKind("art/dnd-tokens/Tokens/goblin.png", ["art/dnd-tokens"]), "token");
const folderIdx = A.indexFrom(["art/dnd-tokens/Dragons/adult blue dragon.png", "art/dnd-tokens/Dragons/black dragon menace.png", "art/dnd-tokens/Goblinoids/goblin.png"],
  new Set([...A.nameKeys("Blue Dragon, Adult"), ...A.nameKeys("Goblin")]), ["art/dnd-tokens"]);
assert.equal(A.artFor("Blue Dragon, Adult", { entries: folderIdx })?.token, "art/dnd-tokens/Dragons/adult blue dragon.png");
assert.equal(A.artFor("Goblin", { entries: folderIdx })?.portrait, "art/dnd-tokens/Goblinoids/goblin.png");
assert.equal(Object.keys(folderIdx).length, 2, "a descriptive name (black dragon menace) matches nothing");
const cfgHtml = hbs(root)("templates/apps/art-config.hbs", { mods: [], folders: "art/dnd-tokens", auto: false, names: 0, images: 0 });
assert.ok(cfgHtml.includes('name="folders"') && cfgHtml.includes("art/dnd-tokens") && cfgHtml.includes('data-action="pickFolder"'));
console.log("OK monster art");

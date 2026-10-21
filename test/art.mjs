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
assert.equal(A.artKey("Goblin (Boss)"), A.artKey("Goblin Boss"), "words in brackets count");
// Any word order (21 Oct): "Red Dragon, Adult" is the pack's adult red dragon however the file puts it.
for (const f of ["Adult Red Dragon.webp", "dragon-red-adult.png", "Red Dragon (Adult).webp", "red_dragon_adult_01.webp"]) assert.equal(A.fileKey(f), A.artKey("Red Dragon, Adult"), f);
assert.equal(A.fileKey("goblins.png"), A.artKey("Goblin"), "plural and singular");
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

// Close names: every word of the monster's and up to two more, never a file named after another monster.
const near = A.nearIndex(["fa/Goblin_Warrior_A1_Sword_01.webp", "fa/Goblin_Boss_01.webp", "fa/Wolf_Dire_01.webp", "fa/wolf_grey_running_huge_01.webp", "fa/Ogre_Club_01.webp"],
  ["Goblin", "Goblin Boss", "Wolf", "Dire Wolf", "Ogre"], new Set([A.artKey("Goblin Boss"), A.artKey("Dire Wolf")]));
assert.equal(near[A.artKey("Goblin")]?.token, "fa/Goblin_Warrior_A1_Sword_01.webp");
assert.equal(near[A.artKey("Ogre")]?.near, true);
assert.ok(!near[A.artKey("Wolf")], "the dire wolf's file isn't the wolf's, and four extra words is too many");
assert.ok(!near[A.artKey("Goblin Boss")], "monsters with exact art aren't looked at again");
// 0.10.36: the extra words must be a role, age, colour or the like, or the file is another creature.
const near2 = A.nearIndex(["pf/vampire-squid.webp", "pf/goblin-dog.webp", "pf/ghost-commoner.webp", "pf/kobold-scout.webp", "pf/chimera-red.webp"],
  ["Vampire", "Goblin", "Commoner", "Kobold", "Chimera"]);
assert.deepEqual(Object.keys(near2).sort(), [A.artKey("Chimera"), A.artKey("Kobold")].sort(), "no squid for a Vampire, no dog for a Goblin, no ghost for a Commoner");

// Pathfinder's names: the remaster's and its own for the same creature, then close kin.
const pf = ["pf/alghollthu-master.webp", "pf/living-wildfire.webp", "pf/specter.webp", "pf/dragon-red-young.webp", "pf/war-pony.webp", "pf/vampire-count.webp", "pf/nosferatu-malefactor.webp"];
const pfIndex = A.indexFrom(pf, new Set(["Aboleth", "Fire Elemental", "Spectre", "Red Dragon, Wyrmling", "Warpony", "Vampire"].flatMap(n => A.nameKeys(n))));
const has = n => A.artFor(n, { entries: pfIndex })?.token;
assert.equal(has("Aboleth"), "pf/alghollthu-master.webp");
assert.equal(has("Fire Elemental"), "pf/living-wildfire.webp");
assert.equal(has("Spectre"), "pf/specter.webp", "UK and US spelling");
assert.equal(has("Red Dragon, Wyrmling"), "pf/dragon-red-young.webp");
assert.equal(has("Warpony"), "pf/war-pony.webp");
assert.equal(has("Vampire"), "pf/vampire-count.webp", "the first alias the pack has");
// Descriptive names: what follows "with" or "in" isn't the creature; run-together words read both ways.
assert.equal(A.fileKey("Humans/mage with owl.png"), A.artKey("Mage"));
assert.equal(A.fileKey("veteran in plate armor.png"), A.artKey("Veteran"));
assert.equal(A.fileKey("in the dark.png"), A.fileKey("dark.png"), "nothing before 'in': the name as it is, less noise");
assert.ok(A.fileKeys("ThugElfFemaleMelee (10).webp").includes("elf-female-melee-thug"));
assert.ok(A.fileKeys("Commoner/HillGiant.webp").includes(A.artKey("Hill Giant")));
assert.equal(A.fileKey("OwlBear.png"), A.artKey("Owlbear"));
assert.deepEqual(Object.keys(A.indexFrom(["m/HillGiant.webp", "m/OwlBear.png"], new Set([A.artKey("Hill Giant"), A.artKey("Owlbear")]))).sort(),
  [A.artKey("Hill Giant"), A.artKey("Owlbear")].sort());
// A folder named after the monster (one folder per creature), never the scanned folder or the module's own.
const fold = A.folderIndex(["modules/tmt/Thug/ThugElfFemaleMelee (10).webp", "modules/tmt/Thug/ThugHumanMale (2).webp", "modules/thug/x.webp",
  "art/kobolds/one.webp", "art/more/Kobolds/kobold bard.png", "art/tokens/Owl/Owlbear Cubs/a.webp"], ["Thug", "Kobold", "Owl", "Bat"], new Set(), ["art/kobolds"]);
assert.equal(fold[A.artKey("Thug")]?.token, "modules/tmt/Thug/ThugHumanMale (2).webp", "the plainest name");
assert.ok(!fold[A.artKey("Kobold")]?.token?.endsWith("one.webp"), "the scanned folder isn't a monster's folder");
assert.equal(fold[A.artKey("Kobold")]?.token, "art/more/Kobolds/kobold bard.png");
assert.ok(!fold[A.artKey("Owl")], "only the folder the image is in");
assert.ok(!fold[A.artKey("Bat")]);
assert.equal(A.folderIndex(["pf/drakes/wyvern.webp", "pf/drakes/river-drake.webp"], ["Drake"])[A.artKey("Drake")].token, "pf/drakes/river-drake.webp", "one named for it first");
// Review cases: a close name or folder file that is another monster's stays theirs; portraits don't fill the token slot.
const roster = ["Goblin", "Goblin Boss", "Ogre", "Ogre Mage", "Wolf", "Dire Wolf", "Winter Wolf", "Skeleton", "Skeleton Warrior", "Bat", "Bat Swarm"];
const near3 = A.nearIndex(["x/Goblin_Boss_Sword.webp", "x/Ogre_Mage_01_sword.webp", "x/skeleton-warrior-sword.webp", "x/skeleton-guard.webp"], roster);
assert.deepEqual(Object.keys(near3).sort(), ["boss-goblin", "mage-ogre", "skeleton-warrior"], "theirs, not the base monster's: no Goblin Boss for a Goblin, no Ogre Mage for an Ogre, no Skeleton Warrior (or its Skeleton Guard) for a Skeleton");
const fold2 = A.folderIndex(["art/Wolf/dire-wolf.webp", "art/Wolf/winter-wolf.webp", "art/Bats/vampire-bat-swarm.webp", "art/Bat Swarm/vampire-bat-swarm.webp"], roster);
assert.ok(!fold2[A.artKey("Wolf")], "a folder of other wolves");
assert.ok(!fold2[A.artKey("Bat")], "a bat swarm is no Bat");
assert.equal(fold2[A.artKey("Bat Swarm")]?.token, "art/Bat Swarm/vampire-bat-swarm.webp");
const near4 = A.nearIndex(["x/portraits/goblin-scout.webp", "x/tokens/goblin-warrior-sword.webp"], ["Goblin"]);
assert.equal(near4[A.artKey("Goblin")].token, "x/tokens/goblin-warrior-sword.webp");
assert.equal(near4[A.artKey("Goblin")].portrait, "x/portraits/goblin-scout.webp");
assert.deepEqual(A.nameKeys("constructor"), ["constructor"], "built-in object names are plain names");
assert.equal(A.artFor("toString", { entries: {} }), null);
assert.ok(A.nameKeys("Yuan-ti Pureblood").some(k => A.fileKeys("YuantiPureblood.webp").includes(k)));
assert.ok(A.nameKeys("Will-o'-Wisp").includes(A.fileKey("WilloWisp.png")));
assert.equal(A.fileKey("DnD_Goblin.webp"), A.artKey("Goblin"));
// 0.10.37: free packs that put the kind first or name the weapon.
const near5 = A.nearIndex(["dn/TP035/demon_mezzoloth.webp", "dn/TP043/vermin_monstrous_spider.webp", "dn/TP036/grimlock_handaxe.webp", "dn/TP035/demon_shadow.webp",
  "x/undead_ogre.webp"], ["Mezzoloth", "Spider", "Grimlock", "Shadow", "Shadow Demon", "Ogre", "Ogre Zombie"]);
assert.deepEqual(Object.keys(near5).sort(), ["demon-shadow", "grimlock", "mezzoloth"], "a shadow demon stays the Shadow Demon's; no monstrous spider for a Spider, no undead ogre for an Ogre");
for (const [name, alts] of Object.entries(A.ALIASES)) assert.ok(Array.isArray(alts) && alts.length && !alts.includes(name), name);

// The settings window.
const html = hbs(root)("templates/apps/art-config.hbs", { mods: [{ id: "some-token-pack", title: "Some Token Pack", checked: true }], auto: false, names: 3, near: 1, images: 10, missing: ["Aboleth", "Kraken"] });
assert.ok(html.includes("2 Bestiary monsters without art") && html.includes("Aboleth, Kraken") && html.includes("1 by a close name"));
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

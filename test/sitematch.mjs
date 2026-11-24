// One rule book, step 3 (the release compare test): the compendiums against the wiki's parsed books
// (public/rules/*.json in the wiki checkout beside this repo, or ARNEYAN_WIKI). A mismatch fails the release.
// Checks the book versions against build/site.lock, then:
// - spells: every site spell, with the same level, school, components, ritual, reversible, save and classes; the
//   Foundry-only spells (the class spell lists in Book III) are a known list, so a new one shows up here;
// - classes: hit die, and the BtH at 12th and 20th the site states;
// - monsters: the same creatures, with HP (Mythic: the block's HP over three phases), AC and saves;
// - the Catalogue's ITEM/PRICE tables: every item, at the site's price where Foundry has one.
// Without a wiki checkout (the release workflow) it says so and passes: run it locally before every release.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
const WIKI = process.env.ARNEYAN_WIKI || path.join(REPO, "..", "arneyan-wiki");
const RULES = path.join(WIKI, "public", "rules");
if (!fs.existsSync(path.join(RULES, "spells.json"))) {
  console.log(`SKIP sitematch: no wiki checkout at ${WIKI} (set ARNEYAN_WIKI)`);
  process.exit(0);
}
const site = n => JSON.parse(fs.readFileSync(path.join(RULES, n), "utf8"));
const pack = d => fs.readdirSync(path.join(REPO, "packs-src", d)).filter(f => f.endsWith(".json"))
  .map(f => JSON.parse(fs.readFileSync(path.join(REPO, "packs-src", d, f), "utf8"))).filter(x => x.system);
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

// ---- Versions
const lock = JSON.parse(fs.readFileSync(path.join(REPO, "build", "site.lock"), "utf8")).books;
const meta = JSON.parse(fs.readFileSync(path.join(WIKI, "rules_src", "meta.json"), "utf8"));
for (const b of meta.books) check(lock[b.id] === b.ver, `${b.id}: wiki ${b.ver}, site.lock ${lock[b.id]}`);

// ---- Spells
const norm = n => n.replace(/\s*\/\s*/g, "/").trim();
const FULL = { Wiz: "Wizard", Sor: "Sorcerer", Ill: "Illusionist", War: "Warlock", Spb: "Spellblade", Nec: "Necromancer",
  Cle: "Cleric", Dru: "Druid", Bar: "Bard", Pal: "Paladin", Wit: "Witch" };
const SAVE = { Reflex: "ref", Fortitude: "fort", Will: "will", "—": "", "": "", Touch: "" };
// Touch spells that then allow a save (touch.mjs TOUCH_THEN_SAVE); Dispel Magic's Will save is the bearer's, for a
// carried item (Book IV's list shows "—").
const SAVE_OK = { Polymorph: "will", "Plane Shift": "will", "Dispel Magic": "will" };
const spells = new Map(pack("spells").map(s => [norm(s.name), s.system]));
const siteSpells = site("spells.json");
for (const s of siteSpells) {
  const p = spells.get(norm(s.n));
  if (!p) { check(false, `spell missing: ${s.n}`); continue; }
  check(p.level === s.l, `${s.n}: level ${p.level}, site ${s.l}`);
  check(p.school === s.sch, `${s.n}: school ${p.school}, site ${s.sch}`);
  check(p.components === s.cp, `${s.n}: components ${p.components}, site ${s.cp}`);
  check(p.ritual === s.rit, `${s.n}: ritual`);
  check(p.reversible === s.rev, `${s.n}: reversible`);
  check((p.save || "") === (SAVE_OK[s.n] ?? SAVE[s.sv ?? ""] ?? s.sv), `${s.n}: save ${p.save}, site ${s.sv}`);
  for (const c of s.cls) check(p.classes.includes(FULL[c] ?? c), `${s.n}: not on the ${FULL[c] ?? c} list`);
  check(/^https:\/\/arneyan-wiki\.pages\.dev\/#\/rules\/spells\//.test(p.source?.url ?? ""), `${s.n}: no rule book link`);
}
// Spells only in the class chapters of Book III (necromancy, hexes, the Warlock's blast), not in Book IV's list.
const FOUNDRY_ONLY = ["Animate Dead (Greater)", "Bestow Curse (Greater)", "Bind Undead", "Bind Wound", "Bone Armour",
  "Cause Fear", "Cause Light Wounds", "Contagion", "Control Undead", "Create Greater Undead", "Disrupt Undead",
  "Eldritch Blast", "Enervation", "Enslave", "Evil Eye", "False Life", "Fear (Mass)", "Feign Death", "Gentle Repose",
  "Ghoul Touch", "Halt Undead", "Harm", "Hex of Stumbling", "Horrid Wilting", "Ill Omen", "Ray of Exhaustion",
  "Slay Living", "Symbol of Death", "Symbol of Pain", "Touch of Fatigue", "Vile Blight", "Wither Limb", "Withering Curse",
  "Withering Glance"];
const siteNames = new Set(siteSpells.map(s => norm(s.n)));
const extra = [...spells.keys()].filter(n => !siteNames.has(n)).sort();
check(JSON.stringify(extra) === JSON.stringify([...FOUNDRY_ONLY].sort()),
  `Foundry-only spells changed: ${extra.filter(n => !FOUNDRY_ONLY.includes(n)).join(", ") || "none new"}; gone: ${FOUNDRY_ONLY.filter(n => !extra.includes(n)).join(", ") || "none"}`);

// ---- Classes
const { ARNEYAN } = await import("../arneyan/module/config.mjs");
const classes = new Map(pack("classes").map(c => [c.name, c.system]));
for (const c of site("classes.json")) {
  const p = classes.get(c.n);
  if (!p) { check(false, `class missing: ${c.n}`); continue; }
  check(p.hitDie === c.hd.match(/d\d+/)?.[0], `${c.n}: hit die ${p.hitDie}, site ${c.hd.slice(0, 20)}`);
  const t = ARNEYAN.bthProgressions[p.bthProgression]?.table;
  for (const lv of [12, 20]) {
    const m = c.bth.match(new RegExp(`\\+(\\d+) at ${lv}th`));
    if (m) check(t?.[lv] === Number(m[1]), `${c.n}: BtH ${t?.[lv]} at ${lv}th, site +${m[1]}`);
  }
}

// ---- Monsters
const monsters = new Map();
for (const m of pack("monsters")) (monsters.get(m.name) ?? monsters.set(m.name, []).get(m.name)).push(m.system);
const MYTHIC = new Set(["Tarrasque", "Tiamat", "Bahamut"]);
const num = s => Number(s.replace("−", "-"));
const siteMonsters = site("monsters.json");
check(siteMonsters.length === [...monsters.values()].flat().length, `monsters: site ${siteMonsters.length}, Foundry ${[...monsters.values()].flat().length}`);
for (const s of siteMonsters) {
  const ps = monsters.get(s.n);
  if (!ps) { check(false, `monster missing: ${s.n}`); continue; }
  const hp = s.html.match(/<b>HD<\/b>[^<]*?\((\d+) HP\)/)?.[1];
  const ac = s.html.match(/<b>AC<\/b> (\d+)/)?.[1];
  const sv = s.html.match(/<b>Saves<\/b> Fort ([+−-]\d+), Ref ([+−-]\d+), Will ([+−-]\d+)/);
  const ok = ps.some(p => {
    const want = hp ? (MYTHIC.has(s.n) ? Math.floor(Number(hp) / 3) : Number(hp)) : null;
    const save = k => (typeof p.saves[k] === "object" ? p.saves[k]?.value : p.saves[k]);
    return (want === null || p.attributes.hp.max === want) && (!ac || p.attributes.ac === Number(ac))
      && (!sv || ["fort", "ref", "will"].every((k, i) => save(k) === num(sv[i + 1])));
  });
  check(ok, `${s.n}: HP ${hp}, AC ${ac}, saves ${sv?.slice(1).join("/")} not matched in Foundry`);
}

// ---- The Catalogue's ITEM/PRICE tables
const gear = new Map();
for (const g of pack("equipment")) (gear.get(g.name.toLowerCase()) ?? gear.set(g.name.toLowerCase(), []).get(g.name.toLowerCase())).push(g.system);
// Rows that aren't goods (rules tables laid out as items) or are a group's sub-rows.
const NOT_GOODS = new Set(["Magic Items", "General Adventuring Basics"]);
// Known gaps: the site shows a price where Foundry shows none (a range, or several prices in the line). Count only.
const BLANK_OK = 63;
// The books disagree: the Catalogue's Mithral armour (+100 gp, Rare) and M&T's Mithral Armour (50 gp, Uncommon);
// Foundry carries M&T's. Listed for [Review].
const PRICE_KNOWN = new Set(["Mithral armour"]);
let blank = 0;
for (const sh of site("items.json")) {
  if (NOT_GOODS.has(sh.shop) || sh.cols.slice(0, 2).map(c => c.toUpperCase()).join() !== "ITEM,PRICE") continue;
  for (const r of sh.rows) {
    const [name, price] = r.c;
    if (/^-\s/.test(name) || /weapon$|steel$/i.test(name)) continue;            // sub-rows; material upgrades
    const ps = (gear.get(name.toLowerCase()) ?? gear.get(name.toLowerCase().replace(/e?s$/, "")))
      ?.filter(p => !/^Unique/.test(p.price ?? ""));
    if (!ps?.length) { check(false, `item missing: ${name} (${sh.shop})`); continue; }
    if (PRICE_KNOWN.has(name)) continue;
    const lead = price.match(/^[\d,]+\s*(?:pp|gp|sp|cp)/)?.[0];
    if (!lead) continue;
    if (ps.every(p => !p.price)) { blank++; continue; }
    check(ps.some(p => p.price.replace(/^.*?(?=\d)/, "").startsWith(lead) || p.price.includes(lead)), `${name}: ${ps.map(p => p.price).join(" / ")}, site ${price}`);
  }
}
check(blank <= BLANK_OK, `items with no price in Foundry but one on the site: ${blank} (known up to ${BLANK_OK})`);

if (fails.length) console.log(fails.slice(0, 40).join("\n"));
assert.equal(fails.length, 0, `${fails.length} mismatches with the site`);
console.log(`OK sitematch: ${siteSpells.length} spells, ${classes.size} classes, ${siteMonsters.length} monsters, catalogue (${blank} prices blank in Foundry)`);

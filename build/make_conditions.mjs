// White game-icons.net glyphs (CC BY 3.0) for condition status icons.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const set = require("@iconify-json/game-icons/icons.json");
const { ARNEYAN } = await import("../arneyan/module/config.mjs");
const out = new URL("../arneyan/assets/conditions/", import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const extra = { exhaustion: "tired-eye" };
const all = { ...Object.fromEntries(Object.entries(ARNEYAN.conditions).map(([k, v]) => [k, v.icon])), ...extra };
for (const [id, glyph] of Object.entries(all)) {
  const icon = set.icons[glyph];
  if (!icon) throw new Error(`missing glyph ${glyph}`);
  fs.writeFileSync(path.join(out, `${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${icon.body.replaceAll("currentColor", "#ffffff")}</svg>`);
}
// The party token: a framed icon in the system's colours.
const party = set.icons["three-friends"].body.replaceAll("currentColor", "#f1ead6");
fs.writeFileSync(new URL("../arneyan/assets/icons/party.svg", import.meta.url).pathname, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="248" fill="#1A3320" stroke="#9a7b2f" stroke-width="14"/><g transform="translate(96 96) scale(0.625)">${party}</g></svg>`);
console.log(`conditions: ${Object.keys(all).length} icons, party token`);

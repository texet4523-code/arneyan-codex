// Writes game-icons.net glyphs (CC BY 3.0) as framed SVG tokens for the system.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const set = require("@iconify-json/game-icons/icons.json");

const [, , usedJson, outDir] = process.argv;
const used = JSON.parse(fs.readFileSync(usedJson, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
const missing = [];
for (const [file, [glyph, [bg, fg]]] of Object.entries(used)) {
  let name = glyph;
  let icon = set.icons[name] ?? set.icons[set.aliases?.[name]?.parent];
  if (!icon) { missing.push(name); icon = set.icons["perspective-dice-six-faces-random"]; }
  const body = icon.body.replaceAll("currentColor", fg);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="${bg}" stop-opacity="0.85"/><stop offset="1" stop-color="${bg}"/></radialGradient></defs>
<rect x="8" y="8" width="496" height="496" rx="64" fill="url(#g)" stroke="#9a7b2f" stroke-width="12"/>
<g transform="translate(76 76) scale(0.703)">${body}</g></svg>`;
  fs.writeFileSync(path.join(outDir, file), svg);
}
console.log(`icons: ${Object.keys(used).length} written, missing glyphs: ${[...new Set(missing)].join(", ") || "none"}`);

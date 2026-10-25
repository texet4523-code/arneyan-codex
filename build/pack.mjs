// Compile packs-src/<pack>/*.json into LevelDB packs inside the system.
import fs from "node:fs";
import path from "node:path";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = path.join(root, "packs-src");
const out = path.join(root, "arneyan", "packs");
// Packs built but not shipped (their manifest entries wait in build/held-back-packs.json). None now: the pregens came
// back with the final playtest version (Kieran, 25 Oct 2026).
const HELD_BACK = new Set([]);
fs.rmSync(out, { recursive: true, force: true });
for (const name of fs.readdirSync(src)) {
  if (HELD_BACK.has(name)) { console.log("held back", name); continue; }
  await compilePack(path.join(src, name), path.join(out, name), { log: false });
  console.log("packed", name, fs.readdirSync(path.join(src, name)).length, "files");
}

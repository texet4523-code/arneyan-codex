// Compile packs-src/<pack>/*.json into LevelDB packs inside the system.
import fs from "node:fs";
import path from "node:path";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = path.join(root, "packs-src");
const out = path.join(root, "arneyan", "packs");
// Built but not shipped yet (Kieran, 25 Oct 2026): the pregens come back with the final playtest version. Their
// manifest entries wait in build/held-back-packs.json.
const HELD_BACK = new Set(["pregens"]);
fs.rmSync(out, { recursive: true, force: true });
for (const name of fs.readdirSync(src)) {
  if (HELD_BACK.has(name)) { console.log("held back", name); continue; }
  await compilePack(path.join(src, name), path.join(out, name), { log: false });
  console.log("packed", name, fs.readdirSync(path.join(src, name)).length, "files");
}

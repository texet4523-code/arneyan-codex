// Token art that fills its square (0.10.119, Kieran 17 Nov: "some tokens are tiny visually").
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
const F = await import("../arneyan/module/tokenfit.mjs");

// An image w × h with an opaque rectangle (x0..x1, y0..y1) on a see-through ground.
const img = (w, h, r) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) d[(y * w + x) * 4 + 3] = 255;
  return d;
};
assert.deepEqual(F.alphaBox(img(10, 10, { x0: 2, y0: 3, x1: 6, y1: 8 }), 10, 10), { x0: 2, y0: 3, x1: 6, y1: 8 });
assert.equal(F.alphaBox(new Uint8ClampedArray(400), 10, 10), null, "all see-through");
const faint = new Uint8ClampedArray(400).fill(10);
assert.equal(F.alphaBox(faint, 10, 10), null, "a faint haze isn't the creature");

// Half the image, centred: twice as big would be 100%, so 0.95 / 0.5 = 1.9, centred.
assert.deepEqual(F.fitFromBox({ x0: 50, y0: 50, x1: 149, y1: 149 }, 200, 200), { scale: 1.9, anchorX: 0.5, anchorY: 0.5 });
// The Fire Giant: two-thirds, a little off to one side.
const giant = F.fitFromBox({ x0: 40, y0: 30, x1: 209, y1: 199 }, 256, 256);
assert.deepEqual(giant, { scale: 1.43, anchorX: 0.5, anchorY: 0.449 }, "nearly centred across, a little high");
// Off-centre: the visible part's middle goes to the token's middle.
const off = F.fitFromBox({ x0: 0, y0: 0, x1: 99, y1: 99 }, 200, 200);
assert.deepEqual(off, { scale: 1.9, anchorX: 0.25, anchorY: 0.25 });
// Already full (Tokenizer's framed tokens, square paintings): left at 1.
assert.deepEqual(F.fitFromBox({ x0: 0, y0: 0, x1: 255, y1: 255 }, 256, 256), { scale: 1, anchorX: 0.5, anchorY: 0.5 });
assert.deepEqual(F.fitFromBox({ x0: 10, y0: 10, x1: 240, y1: 240 }, 256, 256).scale, 1, "90%: close enough");
// Never more than 2½ times.
assert.equal(F.fitFromBox({ x0: 120, y0: 120, x1: 135, y1: 135 }, 256, 256).scale, 2.5);
// A tall image: Foundry fits its height to the square, so the share is the creature's longer side over the height.
assert.equal(F.fitFromBox({ x0: 0, y0: 0, x1: 99, y1: 199 }, 100, 400).scale, 1.9);
assert.deepEqual(F.fitFromBox(null, 100, 100), { scale: 1, anchorX: 0.5, anchorY: 0.5 });
// A token that isn't square (2 × 1): a 3:2 image with a tall creature is fitted by its height, the side that runs out.
// "contain" scales 300 × 200 to 1.5 × 1 squares; the creature (60 × 200 px) is 0.3 × 1: already the full height.
assert.equal(F.fitFromBox({ x0: 120, y0: 0, x1: 179, y1: 199 }, 300, 200, 2, 1).scale, 1);
// The same creature half as tall (100 px): 0.5 of the height, so 1.9 brings it to 0.95.
assert.equal(F.fitFromBox({ x0: 120, y0: 50, x1: 179, y1: 149 }, 300, 200, 2, 1).scale, 1.9);
// A square token gives the same answer as before.
assert.equal(F.fitFromBox({ x0: 50, y0: 50, x1: 149, y1: 149 }, 200, 200, 3, 3).scale, 1.9);

// The GM's own size is kept; this module's last fit may be redone; a mirrored token stays mirrored.
assert.equal(F.mayFit({ scaleX: 1, scaleY: 1 }), true);
assert.equal(F.mayFit({ scaleX: -1, scaleY: 1 }), true, "mirrored at 1");
assert.equal(F.mayFit({ scaleX: 1.2, scaleY: 1.2 }), false, "the GM's size");
assert.equal(F.mayFit({ scaleX: 1.9, scaleY: 1.9 }, { src: "a.webp", scale: 1.9 }), true, "ours from last time");
assert.equal(F.mayFit({ scaleX: 1.9, scaleY: 1.9, anchorX: 0.6, anchorY: 0.5 }, { src: "a.webp", scale: 1.9, anchorX: 0.6, anchorY: 0.5 }), true, "ours, anchor too");
assert.equal(F.mayFit({ scaleX: 1, scaleY: 1, anchorX: 0.3, anchorY: 0.5 }), false, "the GM's own anchor");
assert.equal(F.mayFit({ scaleX: 1.9, scaleY: 1.9, anchorX: 0.7, anchorY: 0.5 }, { src: "a.webp", scale: 1.9, anchorX: 0.6, anchorY: 0.5 }), false, "anchor moved since");
assert.equal(F.sameFit({ scaleX: -1.9, scaleY: 1.9, anchorX: 0.5, anchorY: 0.45 }, { scale: 1.9, anchorX: 0.5, anchorY: 0.45 }), true);
assert.equal(F.sameFit({}, { scale: 1, anchorX: 0.5, anchorY: 0.5 }), true);
assert.equal(F.mayFit({ scaleX: 1.5, scaleY: 1.9 }, { src: "a.webp", scale: 1.9 }), false, "changed since");
const fit = { scale: 1.9, anchorX: 0.5, anchorY: 0.45 };
assert.deepEqual(F.fitUpdate("texture", { scaleX: -1, scaleY: 1 }, fit, "a.webp"),
  { "texture.scaleX": -1.9, "texture.scaleY": 1.9, "texture.anchorX": 0.5, "texture.anchorY": 0.45, "flags.arneyan.artFit": { src: "a.webp", scale: 1.9, anchorX: 0.5, anchorY: 0.45 } });
// Putting a fit back (art that can't be fitted now): scale 1, centred, the flag cleared.
assert.deepEqual(F.fitUpdate("texture", { scaleX: -1.9, scaleY: 1.9 }, { scale: 1, anchorX: 0.5, anchorY: 0.5 }, null),
  { "texture.scaleX": -1, "texture.scaleY": 1, "texture.anchorX": 0.5, "texture.anchorY": 0.5, "flags.arneyan.artFit": null });
assert.deepEqual(Object.keys(F.fitUpdate("prototypeToken.texture", {}, fit, "a.webp")),
  ["prototypeToken.texture.scaleX", "prototypeToken.texture.scaleY", "prototypeToken.texture.anchorX", "prototypeToken.texture.anchorY", "prototypeToken.flags.arneyan.artFit"]);

// Wiring: the hooks, the setting, the art window's checkbox and button, the API.
const src = f => fs.readFileSync(new URL(`../arneyan/${f}`, import.meta.url), "utf8");
const t = src("module/tokenfit.mjs"), a = src("module/art.mjs"), h = src("templates/apps/art-config.hbs");
for (const hook of ["createToken", "updateToken", "createActor", "updateActor"]) assert.ok(t.includes(`Hooks.on("${hook}"`), hook);
assert.ok(/type !== "npc"/.test(t) && /ring\?\.enabled/.test(t), "monsters only, never a ringed token");
assert.ok(/includes\("\*"\)/.test(t) && /\?\? "contain"\) !== "contain"/.test(t), "no wildcards; contain only");
assert.ok(/if \(!v\) cache\.delete\(src\)/.test(t), "a failed read is tried again");
assert.ok(/if \(strict\) throw/.test(t) && /fitToken\(d, \{ strict: true \}\)/.test(t), "the Fit button counts a picture it couldn't read");
assert.ok(/ring\?\.enabled !== undefined/.test(t) && /fitToken\(token, \{ force: true \}\)/.test(t), "a ring, fit or size change measures again");
assert.ok(/registerTokenFit\(\)/.test(a) && /fit: fitAll/.test(a) && /fit: ArneyanArtConfig\.#onFit/.test(a));
assert.ok(/name="fitTokens"/.test(h) && /data-action="fit"/.test(h));
console.log("OK token art fit");

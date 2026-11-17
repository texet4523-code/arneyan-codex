/**
 * Token art that fills its square (Kieran, 17 Nov: "some tokens are tiny visually"). Many art packs pad a creature with
 * see-through space (a Fire Giant fills two-thirds of its image, some dragons half), and Foundry fits the whole image
 * to the token's squares, so the creature looks small. This measures the visible part of a monster token's picture and
 * scales the token's image up (and centres it) so the creature fills its squares. The squares never change.
 *
 * Only monsters (npc actors), only pictures that aren't the system's own icons, never a token with a dynamic ring, and
 * never a scale the GM set by hand: a token is fitted while its image is at 1, or at the scale this set last time.
 */
const SYS = "arneyan";
const ALPHA = 24;            // an alpha above this counts as part of the creature
const TARGET = 0.95;         // the creature's longer side fills this much of the square
const FULL = 0.85;           // art that already fills this much is left at 1
const MAX = 2.5;             // never scale an image up more than this

/**
 * The visible part of an image from its RGBA pixels: { x0, y0, x1, y1 } in pixels (inclusive), or null when it's all
 * see-through. Pure, for tests.
 */
export function alphaBox(data, w, h, threshold = ALPHA) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] <= threshold) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * The token image's scale and anchor for an image w × h whose visible part is `box`, on a token W × H squares:
 * { scale, anchorX, anchorY }. Foundry's "contain" fits the whole image inside the token (by whichever side runs out
 * first), so the creature's share of the token is its size at that fit over the token's size, the tighter way. Art that
 * already fills the token stays at 1, centred. Pure, for tests.
 */
export function fitFromBox(box, w, h, W = 1, H = 1) {
  const plain = { scale: 1, anchorX: 0.5, anchorY: 0.5 };
  if (!box || !w || !h || !(W > 0) || !(H > 0)) return plain;
  const k = Math.min(W / w, H / h);
  const fx = (box.x1 - box.x0 + 1) * k / W, fy = (box.y1 - box.y0 + 1) * k / H;
  const fill = Math.max(fx, fy);
  if (fill >= FULL) return plain;
  const r = (v, n) => Math.round(v * 10 ** n) / 10 ** n;
  const scale = r(Math.min(MAX, TARGET / Math.max(fill, 0.01)), 2);
  // The visible part's middle goes to the token's middle (the anchor is a point on the image, 0 to 1 each way).
  const cx = (box.x0 + box.x1 + 1) / 2 / w, cy = (box.y0 + box.y1 + 1) / 2 / h;
  return { scale, anchorX: Math.abs(cx - 0.5) > 0.02 ? r(cx, 3) : 0.5, anchorY: Math.abs(cy - 0.5) > 0.02 ? r(cy, 3) : 0.5 };
}

/**
 * Whether a token image may be fitted: its texture is at 1 (either way round, a mirrored token's scale is -1) and
 * centred, or still at the scale and anchor this set for its last picture. Anything else is the GM's own. Pure, for tests.
 */
export function mayFit(texture = {}, fit = null) {
  const sx = Math.abs(Number(texture.scaleX ?? 1)), sy = Math.abs(Number(texture.scaleY ?? 1));
  const ax = Number(texture.anchorX ?? 0.5), ay = Number(texture.anchorY ?? 0.5);
  if (sx === 1 && sy === 1 && ax === 0.5 && ay === 0.5) return true;
  return !!fit && sx === fit.scale && sy === fit.scale && ax === (fit.anchorX ?? 0.5) && ay === (fit.anchorY ?? 0.5);
}

/** Whether a texture already shows this fit (scale either way round, and the anchor). Pure, for tests. */
export function sameFit(texture = {}, fit) {
  return Math.abs(Number(texture.scaleX ?? 1)) === fit.scale && Math.abs(Number(texture.scaleY ?? 1)) === fit.scale
    && Number(texture.anchorX ?? 0.5) === fit.anchorX && Number(texture.anchorY ?? 0.5) === fit.anchorY;
}

/** The update for a texture (prefix "texture" or "prototypeToken.texture"), keeping a mirrored image mirrored. */
export function fitUpdate(prefix, texture = {}, fit, src) {
  const sign = v => (Number(v ?? 1) < 0 ? -1 : 1);
  const flagPath = prefix === "texture" ? `flags.${SYS}.artFit` : `prototypeToken.flags.${SYS}.artFit`;
  return {
    [`${prefix}.scaleX`]: sign(texture.scaleX) * fit.scale, [`${prefix}.scaleY`]: sign(texture.scaleY) * fit.scale,
    [`${prefix}.anchorX`]: fit.anchorX, [`${prefix}.anchorY`]: fit.anchorY,
    [flagPath]: src ? { src, scale: fit.scale, anchorX: fit.anchorX, anchorY: fit.anchorY } : null
  };
}

const plainArt = src => !src || /^systems\/arneyan\/|mystery-man|icons\/svg\//.test(String(src));
const isVideo = src => /\.(webm|mp4|m4v|ogg|ogv)(\?|$)/i.test(String(src));
// Pictures this doesn't measure: system icons, videos, a wildcard (a random image from a folder).
const skipSrc = src => plainArt(src) || isVideo(src) || String(src).includes("*");
const cache = new Map();

/**
 * Measure a picture: { box, w, h } of its visible part, or null when it can't be read. Kept for the session; a picture
 * that failed (a timeout, a network blip) is tried again next time.
 */
export function measure(src) {
  if (cache.has(src)) return cache.get(src);
  const p = new Promise(resolve => {
    const done = v => { clearTimeout(timer); resolve(v); };
    const timer = setTimeout(() => done(null), 15000);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        // A smaller copy is plenty to find the edges.
        const w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, 256 / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
        const c = document.createElement("canvas");
        c.width = cw; c.height = ch;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0, cw, ch);
        done({ box: alphaBox(g.getImageData(0, 0, cw, ch).data, cw, ch), w: cw, h: ch });
      } catch (err) {
        console.warn(`Arneyan | token art: can't measure ${src}`, err);
        done(null);
      }
    };
    img.onerror = () => done(null);
    img.src = src;
  });
  cache.set(src, p);
  p.then(v => { if (!v) cache.delete(src); });
  return p;
}

const fitOn = () => { try { return game.settings.get(SYS, "artFit") !== false; } catch { return true; } };
const activeGM = () => !!game.user?.isGM && (game.users?.activeGM ? game.users.activeGM.isSelf : true);

/**
 * The update that fits a texture, or null when nothing needs to change. `texture` the token's or prototype's, `flag`
 * this module's last fit, `W`/`H` the token's size in squares. A picture this can't fit (a system icon, a video, a
 * dynamic ring, a fit other than "contain") puts back an image this enlarged earlier.
 */
async function fitChanges(prefix, texture, flag, W, H, ring, { force = false } = {}) {
  const src = texture?.src;
  const back = () => (flag && mayFit(texture, flag) ? fitUpdate(prefix, texture, { scale: 1, anchorX: 0.5, anchorY: 0.5 }, null) : null);
  if (ring || skipSrc(src) || (texture?.fit ?? "contain") !== "contain") return back();
  if (!force && flag?.src === src) return null;
  if (!mayFit(texture, flag)) return null;
  const m = await measure(src);
  if (!m) return null;
  const fit = fitFromBox(m.box, m.w, m.h, W, H);
  if (sameFit(texture, fit)) {
    // Already showing this fit: nothing to write, unless an enlarged fit should remember its new picture.
    const plain = fit.scale === 1 && fit.anchorX === 0.5 && fit.anchorY === 0.5;
    return plain || flag?.src === src ? null : fitUpdate(prefix, texture, fit, src);
  }
  return fitUpdate(prefix, texture, fit, src);
}

/** Fit one placed token. Returns true if it changed. */
export async function fitToken(token, opts = {}) {
  if (!token || token.actor?.type !== "npc") return false;
  const upd = await fitChanges("texture", token.texture, token.flags?.[SYS]?.artFit ?? null, token.width, token.height, token.ring?.enabled, opts);
  if (!upd) return false;
  await token.update(upd, { arneyanArtFit: true });
  return true;
}

/** Fit a monster's prototype token, so the tokens it places start right. Returns true if it changed. */
export async function fitPrototype(actor, opts = {}) {
  if (actor?.type !== "npc" || actor.pack || actor.isToken) return false;
  const proto = actor.prototypeToken;
  if (!proto) return false;
  const upd = await fitChanges("prototypeToken.texture", proto.texture, proto.flags?.[SYS]?.artFit ?? null, proto.width, proto.height, proto.ring?.enabled, opts);
  if (!upd) return false;
  await actor.update(upd, { arneyanArtFit: true });
  return true;
}

/** Every monster in the world and every monster token on a scene (the art window's button). Returns the counts. */
export async function fitAll() {
  if (!game.user.isGM) return { actors: 0, tokens: 0, failed: 0 };
  let actors = 0, tokens = 0, failed = 0;
  const each = async (fn, doc) => { try { return await fn(doc); } catch (err) { failed++; console.warn(`Arneyan | token art: ${doc?.name}`, err); return false; } };
  for (const a of game.actors) if (await each(fitPrototype, a)) actors++;
  // Every monster token on a scene, linked or not: each has its own picture.
  for (const s of game.scenes) for (const t of s.tokens) if (await each(fitToken, t)) tokens++;
  return { actors, tokens, failed };
}

export function registerTokenFit() {
  game.settings.register(SYS, "artFit", { scope: "world", config: false, type: Boolean, default: true });
  // A monster token placed on a scene, or given a new picture (the art window, Random art, the token's own settings).
  Hooks.on("createToken", token => { if (activeGM() && fitOn()) fitToken(token).catch(err => console.warn("Arneyan | token art", err)); });
  Hooks.on("updateToken", (token, changes, options) => {
    if (options?.arneyanArtFit || !changes?.texture?.src || !activeGM() || !fitOn()) return;
    fitToken(token).catch(err => console.warn("Arneyan | token art", err));
  });
  // A monster brought into the world, or whose token picture changed: its prototype, so new tokens start right.
  Hooks.on("createActor", actor => { if (activeGM() && fitOn()) fitPrototype(actor).catch(err => console.warn("Arneyan | token art", err)); });
  Hooks.on("updateActor", (actor, changes, options) => {
    if (options?.arneyanArtFit || !foundry.utils.hasProperty(changes, "prototypeToken.texture.src") || !activeGM() || !fitOn()) return;
    fitPrototype(actor).catch(err => console.warn("Arneyan | token art", err));
  });
}

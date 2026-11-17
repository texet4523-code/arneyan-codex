// Every dialog can be resized (0.10.120, Kieran 17 Nov).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
const W = await import("../arneyan/module/windows.mjs");
assert.equal(W.resizableWindow({}, { window: { title: "A" } }).window.resizable, true, "on unless asked");
assert.deepEqual(W.resizableWindow({}, { classes: ["dialog"], window: {} }).classes, ["dialog", "arn-resizable"], "the class the layout uses");
assert.equal(W.resizableWindow({}, { window: { resizable: false } }, true).window.resizable, false, "a dialog class that says no stays fixed");
assert.ok(!(W.resizableWindow({}, { window: { resizable: false } }, true).classes ?? []).includes("arn-resizable"));
assert.ok(W.resizableWindow({ window: { resizable: true } }, { window: { resizable: true }, classes: [] }).classes.includes("arn-resizable"), "asked for: the class too");
assert.equal(W.resizableWindow({}, { window: { title: "A" } }).window.title, "A", "the rest kept");
const no = { window: { resizable: false } };
assert.equal(W.resizableWindow(no, no), no, "a dialog that says no stays fixed");
assert.equal(W.resizableWindow({ window: { resizable: true } }, { window: { resizable: true } }).window.resizable, true);
assert.equal(W.resizableWindow(undefined, {}).window.resizable, true);
const src = f => fs.readFileSync(new URL(`../arneyan/${f}`, import.meta.url), "utf8");
assert.ok(/registerWindows\(\)/.test(src("module/arneyan.mjs")));
const css = src("styles/gmtools.css");
assert.ok(/\.application\.dialog\.arn-resizable :is\(\.window-content, \.dialog-form\) > \.dialog-content \{[^}]*overflow-y: auto/.test(css), "a small dialog scrolls");
assert.ok(/\.application\.dialog\.arn-resizable \.window-content > \.dialog-form \{[^}]*min-height: 0/.test(css), "through Foundry's form");
assert.ok(/:is\(\.window-content, \.dialog-form\) > \.form-footer \{ flex: 0 0 auto; \}/.test(css) && !/max-height: 420px/.test(css), "the buttons stay in view");
// The system's own windows (ApplicationV2 classes) are all resizable already.
for (const f of fs.readdirSync(new URL("../arneyan/module/", import.meta.url)).filter(f => f.endsWith(".mjs"))) {
  const t = src(`module/${f}`);
  for (const m of t.matchAll(/static DEFAULT_OPTIONS = \{([\s\S]*?)\n  \};/g)) {
    const win = (m[1].match(/window: \{[^}]*\}/) ?? [""])[0];
    assert.ok(!win || /resizable: true/.test(win), `${f}: a window that can't be resized`);
  }
}
console.log("OK resizable windows");

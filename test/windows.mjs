// Every dialog can be resized (0.10.120, Kieran 17 Nov).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
const W = await import("../arneyan/module/windows.mjs");
assert.equal(W.resizableWindow({}, { window: { title: "A" } }).window.resizable, true, "on unless asked");
assert.equal(W.resizableWindow({}, { window: { title: "A" } }).window.title, "A", "the rest kept");
const no = { window: { resizable: false } };
assert.equal(W.resizableWindow(no, no), no, "a dialog that says no stays fixed");
assert.equal(W.resizableWindow({ window: { resizable: true } }, { window: { resizable: true } }).window.resizable, true);
assert.equal(W.resizableWindow(undefined, {}).window.resizable, true);
const src = f => fs.readFileSync(new URL(`../arneyan/${f}`, import.meta.url), "utf8");
assert.ok(/registerWindows\(\)/.test(src("module/arneyan.mjs")));
const css = src("styles/gmtools.css");
assert.ok(/\.application\.dialog\.resizable \.window-content > \.dialog-content \{[^}]*overflow-y: auto/.test(css), "a small dialog scrolls");
assert.ok(/\.arneyan\.arn-bulk-app \.form-footer \{ flex: 0 0 auto; \}/.test(css) && !/max-height: 420px/.test(css), "Select keeps its buttons in view");
// The system's own windows (ApplicationV2 classes) are all resizable already.
for (const f of fs.readdirSync(new URL("../arneyan/module/", import.meta.url)).filter(f => f.endsWith(".mjs"))) {
  const t = src(`module/${f}`);
  for (const m of t.matchAll(/static DEFAULT_OPTIONS = \{([\s\S]*?)\n  \};/g)) {
    const win = (m[1].match(/window: \{[^}]*\}/) ?? [""])[0];
    assert.ok(!win || /resizable: true/.test(win), `${f}: a window that can't be resized`);
  }
}
console.log("OK resizable windows");

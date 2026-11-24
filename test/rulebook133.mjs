// 0.10.133: Read in the rule book links. The page-link click handler leaves a link with an href alone (it used to open
// the PDF at page 0), and an item's source.url takes only https addresses.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

const main = fs.readFileSync(new URL("../arneyan/module/arneyan.mjs", import.meta.url), "utf8");
const i = main.indexOf('closest?.(".arn-page-link")');
assert.ok(i > 0);
const body = main.slice(i, main.indexOf("openPdf(", i));
assert.match(body, /hasAttribute\("href"\)\) return;/, "an href link isn't sent to the PDF");
assert.ok(body.indexOf('hasAttribute("href")') < body.indexOf("preventDefault"), "checked before preventDefault");

const models = fs.readFileSync(new URL("../arneyan/module/data/item-models.mjs", import.meta.url), "utf8");
const m = models.match(/url: new StringField\(\{[^}]*validate: (v => [^}]*?)\s*\}\)/);
assert.ok(m, "url has a validate");
const ok = eval(m[1]);
assert.equal(ok(""), true);
assert.equal(ok("https://arneyan-wiki.pages.dev/#/rules/spells/bless"), true);
assert.equal(ok("javascript:alert(1)"), false);
assert.equal(ok("http://example.com"), false);

// Every packed url is https and points at the rule book.
for (const dir of ["spells", "classes", "class-features", "kits", "ancestries"]) {
  for (const f of fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url))) {
    const d = JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8"));
    const u = d.system?.source?.url;
    if (u) assert.ok(ok(u) && u.startsWith("https://arneyan-wiki.pages.dev/#/rules/"), `${dir}/${f}: ${u}`);
  }
}
console.log("OK rule book links");

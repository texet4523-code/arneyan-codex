// 0.10.134: the calendar's Wiki button (Wiki's d4f6def). The address it opens, and Kanka no longer following the date.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

const { wikiDayUrl } = await import("../arneyan/module/wiki-calendar.mjs");
const d = { year: 503, month: 4, day: 12 };
assert.equal(wikiDayUrl("https://arneyan-wiki.pages.dev/", d), "https://arneyan-wiki.pages.dev/#/calendar/503/4/12/foundry");
assert.equal(wikiDayUrl("https://example.org//", d), "https://example.org/#/calendar/503/4/12/foundry", "one slash before the hash");
assert.equal(wikiDayUrl("javascript:alert(1)", d), "https://arneyan-wiki.pages.dev/#/calendar/503/4/12/foundry", "only http(s) addresses");
assert.equal(wikiDayUrl("", d), "https://arneyan-wiki.pages.dev/#/calendar/503/4/12/foundry");

const kanka = fs.readFileSync(new URL("../arneyan/module/kanka.mjs", import.meta.url), "utf8");
assert.ok(!/Hooks\.on\("updateWorldTime"/.test(kanka) && !/Hooks\.on\("arneyanDateChanged"/.test(kanka), "Kanka no longer follows the date");
const tpl = fs.readFileSync(new URL("../arneyan/templates/apps/calendar.hbs", import.meta.url), "utf8");
assert.ok(/data-action="wiki"/.test(tpl) && !/data-action="kanka"/.test(tpl), "the button is the Wiki one");
console.log("OK wiki calendar button");

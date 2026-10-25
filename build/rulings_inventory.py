"""Kieran's inventory calls of 25 Oct 2026 (board F13, F15) shown in the in-system Book V Catalogue journal until the
books carry them (F-B7): Knives and scrolls bundle 5 a slot. Each row's slot cell "1" becomes "1 (bundles 5/slot)";
a row the books already mark is left alone, so this does nothing once the books catch up.
"""
import re
from books_0104 import _each, _save

ROWS = re.compile(r"<tr><td>(Knife|Scroll, [^<]+)</td>(?:(?!</tr>).)*?</tr>", re.S)


def build():
    rows = 0
    for f, d in _each("rules"):
        if "pages" not in d or not d["name"].startswith("Book V"):
            continue
        ch = False
        for p in d["pages"]:
            c = p.get("text", {}).get("content", "")
            def fix(m):
                row = m.group(0)
                if "bundles" in row or row.count("<td>1</td>") != 1:
                    return row
                return row.replace("<td>1</td>", "<td>1 (bundles 5/slot)</td>")
            c2 = ROWS.sub(fix, c)
            if c2 != c:
                rows += c2.count("<td>1 (bundles 5/slot)</td>") - c.count("<td>1 (bundles 5/slot)</td>")
                p["text"]["content"] = c2; ch = True
        if ch:
            _save(f, d)
    return rows

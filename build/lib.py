"""Shared helpers for turning the Arneyan book sources into Foundry documents."""
import hashlib, html, json, os, re
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph as DP
from docx.table import Table as DT

OUT = os.path.join(os.path.dirname(__file__), "..", "packs-src")
STATS = {}

def fid(*parts):
    """Deterministic 16-character Foundry id."""
    h = hashlib.sha1("|".join(parts).encode()).hexdigest()
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    n = int(h, 16)
    s = ""
    for _ in range(16):
        n, r = divmod(n, len(alphabet))
        s += alphabet[r]
    return s

def esc(t):
    return html.escape(t, quote=False)

def fix(t):
    t = re.sub(r"\bCK\b", "GM", t)
    return t

def md_inline(t):
    """Markdown inline (**bold**, *italic*) to HTML."""
    t = esc(fix(t))
    t = re.sub(r"\*\*\*(.+?)\*\*\*", r"<strong><em>\1</em></strong>", t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", t)
    return t

def runs_html(p):
    out = []
    for r in p.runs:
        t = esc(fix(r.text))
        if not t:
            continue
        if r.bold and r.italic:
            t = f"<strong><em>{t}</em></strong>"
        elif r.bold:
            t = f"<strong>{t}</strong>"
        elif r.italic:
            t = f"<em>{t}</em>"
        out.append(t)
    s = "".join(out)
    s = s.replace("</strong><strong>", "").replace("</em><em>", "")
    return s.strip()

def table_html(rows, cls="arn-table"):
    if not rows:
        return ""
    h = f'<table class="{cls}"><thead><tr>' + "".join(f"<th>{esc(fix(c))}</th>" for c in rows[0]) + "</tr></thead><tbody>"
    for r in rows[1:]:
        h += "<tr>" + "".join(f"<td>{esc(fix(c))}</td>" for c in r) + "</tr>"
    return h + "</tbody></table>"

def tbl_rows(tb):
    rows = []
    for r in tb.rows:
        cells = []
        prev = None
        for c in r.cells:
            if c._tc is prev:
                continue
            prev = c._tc
            cells.append(c.text.strip())
        rows.append(cells)
    return rows

def walk_docx(d):
    """Yield ('p', paragraph, info) or ('table', rows) in document order."""
    for el in d.element.body:
        if el.tag.endswith("}p"):
            p = DP(el, d)
            t = p.text.strip()
            if not t:
                continue
            num = el.find(".//" + qn("w:numPr")) is not None
            lvl = 0
            if num:
                lv = el.find(".//" + qn("w:ilvl"))
                lvl = int(lv.get(qn("w:val"))) if lv is not None else 0
            allb = all(r.bold for r in p.runs if r.text.strip())
            yield ("p", p, {"text": t, "style": p.style.name, "list": num, "lvl": lvl, "bold": allb})
        elif el.tag.endswith("}tbl"):
            yield ("table", tbl_rows(DT(el, d)), None)

class HtmlBuf:
    """Collects paragraphs and lists into HTML."""
    def __init__(self):
        self.parts = []
        self.list_depth = -1
    def _close_lists(self, to=-1):
        while self.list_depth > to:
            self.parts.append("</li></ul>")
            self.list_depth -= 1
    def li(self, inner, lvl=0):
        if self.list_depth < lvl:
            while self.list_depth < lvl:
                self.parts.append("<ul><li>")
                self.list_depth += 1
            self.parts.append(inner)
        else:
            self._close_lists(lvl)
            self.parts.append(f"</li><li>{inner}")
    def add(self, h):
        self._close_lists()
        self.parts.append(h)
    def html(self):
        self._close_lists()
        return "".join(self.parts).replace("<li></li>", "")
    def empty(self):
        return not any(p.strip() for p in self.parts)

def md_to_html(md):
    """Small markdown converter for the cc2.md / shop2.md style sources."""
    buf = HtmlBuf()
    lines = md.split("\n")
    i = 0
    while i < len(lines):
        ln = lines[i].rstrip()
        s = ln.strip()
        if not s:
            i += 1
            continue
        if s.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            buf.add(md_table_html(rows))
            continue
        m = re.match(r"^(#{1,6})\s+(.*)", s)
        if m:
            lvl = min(len(m.group(1)) + 1, 5)
            buf.add(f"<h{lvl}>{md_inline(m.group(2))}</h{lvl}>")
        elif re.match(r"^(\s*)([-*•]|\d+\.)\s+", ln):
            ind = len(re.match(r"^(\s*)", ln).group(1))
            body = re.sub(r"^\s*([-*•]|\d+\.)\s+", "", ln)
            buf.li(md_inline(body), 1 if ind >= 4 else 0)
        else:
            buf.add(f"<p>{md_inline(s)}</p>")
        i += 1
    return buf.html()

def md_table_html(rows):
    if not rows:
        return ""
    h = '<table class="arn-table"><thead><tr>' + "".join(f"<th>{md_inline(c)}</th>" for c in rows[0]) + "</tr></thead><tbody>"
    for r in rows[1:]:
        h += "<tr>" + "".join(f"<td>{md_inline(c)}</td>" for c in r) + "</tr>"
    return h + "</tbody></table>"

def md_sections(md, level):
    """Split markdown on headings of exactly `level` #s. Returns [(title, body)]."""
    out = []
    cur = None
    buf = []
    pat = re.compile(r"^" + "#" * level + r"\s+(.*)")
    for ln in md.split("\n"):
        m = pat.match(ln)
        if m and not ln.startswith("#" * (level + 1)):
            if cur is not None:
                out.append((cur, "\n".join(buf)))
            cur = m.group(1).strip()
            buf = []
        elif cur is not None:
            buf.append(ln)
    if cur is not None:
        out.append((cur, "\n".join(buf)))
    return out

def plain(s):
    return re.sub(r"\*+", "", s).strip()

# ---------------------------------------------------------------- output

def item(pack, name, type_, system, img, folder=None, sort=0, key=None):
    _id = fid(pack, type_, key or name)
    doc = {
        "_id": _id, "_key": f"!items!{_id}", "name": name, "type": type_, "img": img,
        "system": system, "effects": [], "folder": folder, "sort": sort,
        "ownership": {"default": 0}, "flags": {}
    }
    write(pack, doc)
    return doc

def folder(pack, name, type_="Item", parent=None, sort=0, color=None):
    _id = fid(pack, "folder", name, parent or "")
    doc = {"_id": _id, "_key": f"!folders!{_id}", "name": name, "type": type_, "folder": parent,
           "sorting": "a", "sort": sort, "color": color, "flags": {}, "description": ""}
    write(pack, doc)
    return _id

def journal(pack, name, pages, folder=None, sort=0):
    _id = fid(pack, "journal", name)
    ps = []
    for i, (title, content) in enumerate(pages):
        pid = fid(pack, "page", name, title, str(i))
        ps.append({
            "_id": pid, "_key": f"!journal.pages!{_id}.{pid}", "name": title, "type": "text",
            "title": {"show": True, "level": 1}, "text": {"format": 1, "content": content},
            "sort": (i + 1) * 100000, "ownership": {"default": -1}, "flags": {}
        })
    doc = {"_id": _id, "_key": f"!journal!{_id}", "name": name, "pages": ps, "folder": folder,
           "sort": sort, "ownership": {"default": 0}, "flags": {}}
    write(pack, doc)
    return doc

def actor(pack, name, type_, system, img, items=(), folder=None, prototype=None):
    _id = fid(pack, "actor", name)
    its = []
    for it in items:
        iid = fid(pack, "actoritem", name, it["name"], it["type"], str(len(its)))
        d = dict(it)
        d["_id"] = iid
        d["_key"] = f"!actors.items!{_id}.{iid}"
        d.setdefault("effects", [])
        d.setdefault("flags", {})
        d.setdefault("sort", len(its) * 100)
        d.setdefault("ownership", {"default": 0})
        d.setdefault("folder", None)
        its.append(d)
    doc = {"_id": _id, "_key": f"!actors!{_id}", "name": name, "type": type_, "img": img,
           "system": system, "items": its, "effects": [], "folder": folder,
           "prototypeToken": prototype or {"name": name, "texture": {"src": img}, "actorLink": False},
           "ownership": {"default": 0}, "flags": {}}
    write(pack, doc)
    return doc

def write(pack, doc):
    d = os.path.join(OUT, pack)
    os.makedirs(d, exist_ok=True)
    safe = re.sub(r"[^\w-]+", "_", doc["name"])[:60]
    kind = doc["_key"].split("!")[1]
    with open(os.path.join(d, f"{kind}_{safe}_{doc['_id']}.json"), "w") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    STATS[pack] = STATS.get(pack, 0) + (0 if kind == "folders" else 1)

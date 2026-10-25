"""Book I: Core Rules journal from the Handbook's Book I (books_md.CODEX, v0.10.11), one page per rule."""
import re
import docx
from lib import *
import books_md

def build():
    d = docx.Document(books_md.CODEX)
    pages = []
    section = ""
    title = "Introduction"
    buf = HtmlBuf()
    first = True

    def flush():
        nonlocal buf
        if not buf.empty():
            pages.append((title, buf.html()))
        buf = HtmlBuf()

    for kind, obj, info in walk_docx(d):
        if kind == "table":
            buf.add(table_html(obj))
            continue
        p, t = obj, info["text"]
        if first and info["style"] not in ("Heading 1", "Heading 2"):
            if t in ("The Arneyan Codex", "Arneyan Campaign Setting"):
                continue
        first = False
        if info["style"] == "Heading 1":
            flush()
            section = re.sub(r"^Section [IVX]+\s+—\s+", "", t)
            title = section
            continue
        if info["style"] == "Heading 2":
            flush()
            title = t
            continue
        if info["list"]:
            buf.li(runs_html(p), info["lvl"])
        else:
            buf.add(f"<p>{runs_html(p)}</p>")
    flush()
    journal("rules", "Book I: Core Rules", pages, sort=1)

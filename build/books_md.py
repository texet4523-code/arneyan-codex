"""The Handbook from the Builder's Markdown sources (books v0.10.11, board F5; v0.10.13, board F10, 25 Oct 2026).

The Builder sends each Handbook book as Markdown converted by pandoc, with the tables as HTML. The readers here were
written for the older Word and Markdown copies, so each book is turned back into the shape they read:

- Book I (Codex) and Book IV (Spellcasting): Markdown -> HTML -> Word with pandoc (the HTML step keeps the tables;
  Markdown straight to Word drops them). The Word files have the same headings, lists and tables as the old ones.
- Book III (Classes): split at each "<!-- CLASS: Name -->" into one Word file per class, as cls/clean2 was.
- Book II (Character Creation) and Book V (Catalogue): already in the old Markdown form; copied as they are.

Sources: /tmp/hb/src_v01013/HB_v0.10.13_*.md (md5s on the board, F10). Output: /tmp/hb/v01011.
"""
import glob, os, re, shutil, subprocess

SRC = "/tmp/hb/src_v01014"
OUT = "/tmp/hb/v01011"
VERSION = "0.10.14"
CODEX = os.path.join(OUT, "I_Codex.docx")
SPELLS = os.path.join(OUT, "IV_Spellcasting.docx")
CLASSES = os.path.join(OUT, "cls")
CC = os.path.join(OUT, "II_Character_Creation.md")
SHOP = os.path.join(OUT, "V_Catalogue.md")


def src(part):
    p = os.path.join(SRC, f"HB_v{VERSION}_{part}.md")
    if not os.path.exists(p):
        raise SystemExit(f"Missing Handbook source {p}: copy the Builder's v{VERSION} Markdown there (board F5, F10).")
    return p


def to_docx(md_path, docx_path):
    html = docx_path[:-5] + ".html"
    subprocess.run(["pandoc", "-f", "markdown-smart", "-t", "html", md_path, "-o", html], check=True)
    # pandoc marks "↔" for text presentation (U+FE0E); the book has no such character.
    h = open(html, encoding="utf-8").read()
    open(html, "w", encoding="utf-8").write(h.replace("\ufe0e", ""))
    subprocess.run(["pandoc", "-f", "html", "-t", "docx", html, "-o", docx_path], check=True)
    os.remove(html)


def prepare():
    os.makedirs(CLASSES, exist_ok=True)
    to_docx(src("I_Codex"), CODEX)
    to_docx(src("IV_Spellcasting"), SPELLS)
    shutil.copyfile(src("II_Character_Creation"), CC)
    shutil.copyfile(src("V_Catalogue"), SHOP)
    for f in glob.glob(os.path.join(CLASSES, "*")):
        os.remove(f)
    parts = re.split(r"^<!-- CLASS: (.+?) -->\s*$", open(src("III_Classes"), encoding="utf-8").read(), flags=re.M)
    names = []
    for name, body in zip(parts[1::2], parts[2::2]):
        name = name.strip()
        md = os.path.join(CLASSES, f"{name}.md")
        open(md, "w", encoding="utf-8").write(body)
        to_docx(md, os.path.join(CLASSES, f"{name}.docx"))
        os.remove(md)
        names.append(name)
    assert len(names) == 22, f"Book III should have 22 classes, found {len(names)}"
    return {"version": VERSION, "classes": len(names)}

"""The Handbook from the Builder's Markdown sources (books v0.10.11, board F5; v0.10.13, board F10; v0.10.15, board B-F5; v0.10.16, board F-B9; v0.10.18, board F-B10; v0.10.20, board B-F7; v0.10.23, board B-F10; v0.10.24, board B-F11, 27 Oct 2026; v0.10.27, board B-F12 to B-F14; v0.10.30, board B-F15 to B-F17; v0.10.31, board B-F18 (K25 Last Chance); v0.10.32, board B-F19 (K28, K29), 28 Oct 2026; v0.10.33, board B-F20 (R-B14, K30); v0.10.34, board B-F21 (K31 Monk), 29 Oct 2026).

The Builder sends each Handbook book as Markdown converted by pandoc, with the tables as HTML. The readers here were
written for the older Word and Markdown copies, so each book is turned back into the shape they read:

- Book I (Codex) and Book IV (Spellcasting): Markdown -> HTML -> Word with pandoc (the HTML step keeps the tables;
  Markdown straight to Word drops them). The Word files have the same headings, lists and tables as the old ones.
- Book III (Classes): split at each "<!-- CLASS: Name -->" into one Word file per class, as cls/clean2 was.
- Book II (Character Creation) and Book V (Catalogue): already in the old Markdown form; copied as they are.

Sources: /tmp/hb/src_v01034/HB_v0.10.34_*.md (md5s on the board, B-F12 to B-F21). Book III is the Builder's v0.10.34,
Book I its v0.10.32 (unchanged), Book II its v0.10.31; the M&T sources (/tmp/hb/mm) its v0.10.33; Books IV and V
are the v0.10.20 copies under the new name (Atonement patched below). Output: /tmp/hb/v01011.
"""
import glob, os, re, shutil, subprocess

SRC = "/tmp/hb/src_v01034"
OUT = "/tmp/hb/v01011"
VERSION = "0.10.34"
CODEX = os.path.join(OUT, "I_Codex.docx")
SPELLS = os.path.join(OUT, "IV_Spellcasting.docx")
CLASSES = os.path.join(OUT, "cls")
CC = os.path.join(OUT, "II_Character_Creation.md")
SHOP = os.path.join(OUT, "V_Catalogue.md")


def src(part):
    p = os.path.join(SRC, f"HB_v{VERSION}_{part}.md")
    if not os.path.exists(p):
        raise SystemExit(f"Missing Handbook source {p}: copy the Builder's v{VERSION} Markdown there (md5s on the board).")
    return p


def to_docx(md_path, docx_path):
    html = docx_path[:-5] + ".html"
    subprocess.run(["pandoc", "-f", "markdown-smart", "-t", "html", md_path, "-o", html], check=True)
    # pandoc marks "↔" for text presentation (U+FE0E); the book has no such character.
    h = open(html, encoding="utf-8").read()
    open(html, "w", encoding="utf-8").write(h.replace("\ufe0e", ""))
    subprocess.run(["pandoc", "-f", "html", "-t", "docx", html, "-o", docx_path], check=True)
    os.remove(html)


# Book IV changed in v0.10.20 only in Atonement (m28, HB p.154). The Builder sent the new text on the board (B-F7)
# rather than a new Book IV Markdown, so the v0.10.18 copy gets it here.
SPELL_PATCHES = [(
    "Ends any alignment penalty or loss of class features and spellcasting caused by its wilful acts, and restores an alignment changed by magic.",
    "A god's servant moves one step towards Favoured (see Divine Favour in Book II); anyone else loses an Evil Allegiance from profane acts. It also restores an Outlook changed by magic.",
)]


# Book I's Fighter Manoeuvre Mastery tiers (2nd and 9th, B7) were patched here until the Builder sent a new Codex
# (v0.10.26, B-F13), which has them.
CODEX_PATCHES = []


def patched(part, patches):
    text = open(src(part), encoding="utf-8").read()
    for old, new in patches:
        if new in text:
            continue
        assert text.count(old) == 1, f"{part}: expected the text to patch once: {old[:60]}"
        text = text.replace(old, new)
    out = os.path.join(OUT, f"{part}.patched.md")
    open(out, "w", encoding="utf-8").write(text)
    return out


def prepare():
    os.makedirs(CLASSES, exist_ok=True)
    codex = patched("I_Codex", CODEX_PATCHES)
    to_docx(codex, CODEX)
    os.remove(codex)
    spells = patched("IV_Spellcasting", SPELL_PATCHES)
    to_docx(spells, SPELLS)
    os.remove(spells)
    shutil.copyfile(src("II_Character_Creation"), CC)
    shutil.copyfile(src("V_Catalogue"), SHOP)
    for f in glob.glob(os.path.join(CLASSES, "*")):
        os.remove(f)
    # v0.10.32 wraps long list items with "> " continuation lines straight after the item's line: they are the item's
    # own words, not a quote. A nested sub-point's first line ("    > " after a blank line) keeps its marker; its later
    # lines are joined to it (pandoc reads them as the same paragraph either way).
    lines = open(src("III_Classes"), encoding="utf-8").read().split("\n")
    for i in range(1, len(lines)):
        m = re.match(r"^( +)> (.*)$", lines[i])
        if m and lines[i - 1].strip():
            lines[i] = m.group(1) + m.group(2)
    classes_md = "\n".join(lines)
    parts = re.split(r"^<!-- CLASS: (.+?) -->\s*$", classes_md, flags=re.M)
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

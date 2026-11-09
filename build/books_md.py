"""The Handbook from the Builder's Markdown sources (books v0.10.11, board F5; v0.10.13, board F10; v0.10.15, board B-F5; v0.10.16, board F-B9; v0.10.18, board F-B10; v0.10.20, board B-F7; v0.10.23, board B-F10; v0.10.24, board B-F11, 27 Oct 2026; v0.10.27, board B-F12 to B-F14; v0.10.30, board B-F15 to B-F17; v0.10.31, board B-F18 (K25 Last Chance); v0.10.32, board B-F19 (K28, K29), 28 Oct 2026; v0.10.33, board B-F20 (R-B14, K30); v0.10.34, board B-F21 (K31 Monk), 29 Oct 2026; v0.10.35, board B-F22 (K33, K34), 1 Nov 2026; v0.10.37, board B-F23 and B-F24 (K35 to K43); v0.10.38, board B-F25 (K44, K45), 2 Nov 2026).

The Builder sends each Handbook book as Markdown converted by pandoc, with the tables as HTML. The readers here were
written for the older Word and Markdown copies, so each book is turned back into the shape they read:

- Book I (Codex) and Book IV (Spellcasting): Markdown -> HTML -> Word with pandoc (the HTML step keeps the tables;
  Markdown straight to Word drops them). The Word files have the same headings, lists and tables as the old ones.
- Book III (Classes): split at each "<!-- CLASS: Name -->" into one Word file per class, as cls/clean2 was.
- Book II (Character Creation) and Book V (Catalogue): already in the old Markdown form; copied as they are.

Sources: /tmp/hb/src_v01043/HB_v0.10.43_*.md (md5s on the board, B-F12 to B-F31). Books I to IV are the Builder's
v0.10.43, the M&T sources (split into /tmp/hb/mm) its v0.10.42; Book V is the v0.10.20 copy under the new name.
Output: /tmp/hb/v01011.
"""
import glob, os, re, shutil, subprocess

SRC = "/tmp/hb/src_v01060"
OUT = "/tmp/hb/v01011"
VERSION = "0.10.60"
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


# Book IV's Atonement (m28) was patched here until the Builder sent a new Book IV (v0.10.38, B-F25), which has it.
SPELL_PATCHES = []


# Book I's Fighter Manoeuvre Mastery tiers (2nd and 9th, B7) were patched here until the Builder sent a new Codex
# (v0.10.26, B-F13), which has them.
CODEX_PATCHES = []


def joined(text):
    """Pandoc's "> " continuation lines straight after a list item's line are the item's own words, not a quote
    (Book III since v0.10.32, Book IV since v0.10.38). A nested sub-point's first line ("    > " after a blank line)
    keeps its marker; its later lines are joined to it (pandoc reads them as the same paragraph either way)."""
    lines = text.split("\n")
    for i in range(1, len(lines)):
        m = re.match(r"^( +)> (.*)$", lines[i])
        if m and lines[i - 1].strip():
            lines[i] = m.group(1) + m.group(2)
    return "\n".join(lines)


def patched(part, patches):
    text = joined(open(src(part), encoding="utf-8").read())
    for old, new in patches:
        if new in text:
            continue
        assert text.count(old) == 1, f"{part}: expected the text to patch once: {old[:60]}"
        text = text.replace(old, new)
    out = os.path.join(OUT, f"{part}.patched.md")
    open(out, "w", encoding="utf-8").write(text)
    return out


# The Catalogue lists the staple Iconic items; Monsters & Treasure has the full list (v0.10.53, R-B38, B-F46). Every
# M&T Iconic item the Catalogue's matching section lacks is added to the Catalogue copy, so it becomes equipment too.
MT_TREASURE = "/tmp/hb/mm/treasure.md"
ICONIC_SECTIONS = [("Iconic Weapons", "Iconic Weapons"), ("Iconic Armour and Shields", "Iconic Armour & Shields"),
                   ("Iconic Rings", "Iconic Rings"), ("Iconic Wands, Staffs and Rods", "Iconic Wands, Staffs & Rods"),
                   ("Iconic Wondrous Items", "Iconic Wondrous Items")]


def _section(text, head, level):
    return re.search(rf"^{level} {re.escape(head)}\s*$(.*?)(?=^#{{2,3}} |\Z)", text, re.M | re.S)


def _item_rows(body):
    return [l for l in body.splitlines() if l.startswith("| ") and not l.startswith("| Item") and not l.startswith("|---")]


def _row_name(row):
    return re.sub(r"\s*\[.*", "", row.split("|")[1].strip())


# Books M&T v0.10.56 (R-B38 Part 3): items that come in kinds are a note block after the Wondrous table, one paragraph a
# kind ("**Ioun Stones.** ... *Rare, 300 gp:* Awareness (you can't be surprised); ..."). Each becomes a table row of
# its own, in the table's columns, from the paragraph's own words; the counts are checked so a changed book is noticed.
SET_KINDS = {"Belts of Giant Strength": 6, "Elemental Vessels": 4, "Feather Tokens": 6, "Figurines of Wondrous Power": 9,
             "Horns of Valhalla": 4, "Ioun Stones": 14, "Manuals and Tomes": 6}


def set_rows(mt):
    paras = dict(re.findall(r"^\*\*([^*]+?)\.\*\*\s*(.+)$", mt.split("Items that come in sets follow the table.", 1)[-1].split("\n## ", 1)[0], re.M))
    rows = []

    def row(name, rarity, value, effect, slots="1"):
        rows.append(f"| {name} [{rarity}] | {value} | {effect.strip()} | {slots} |")

    t = paras.get("Belts of Giant Strength", "")
    if t:
        set_to = lambda n, more="": f"Worn, it sets your Strength to {n} unless yours is higher{more}."
        row("Belt of Hill Giant Strength", "Rare", "300 gp", set_to(19))
        row("Belt of Stone Giant Strength", "Rare", "450 gp", set_to(20))
        row("Belt of Frost Giant Strength", "Rare", "450 gp", set_to(20))
        row("Belt of Fire Giant Strength", "Very Rare", "800 gp", set_to(20, ", and you have Advantage on Strength checks"))
        row("Belt of Cloud Giant Strength", "Very Rare", "1,200 gp", set_to(20, ", and you have Advantage on Strength checks and Fortitude saves"))
        row("Belt of Storm Giant Strength", "Very Rare", "2,000 gp", set_to(22, ": the exception to the Mortal Limit"))
    t = paras.get("Elemental Vessels", "")
    if t:
        how = t.split(": each Rare, 400 gp. ", 1)[1]
        for n in ("Bowl of Commanding Water Elementals", "Brazier of Commanding Fire Elementals", "Censer of Controlling Air Elementals", "Stone of Controlling Earth Elementals"):
            row(n, "Rare", "400 gp", how, "2" if n.startswith("Brazier") else "1")
    t = paras.get("Feather Tokens", "")
    if t:
        for n, eff in re.findall(r"(Anchor|Bird|Fan|Swan Boat|Tree|Whip): ([^.]+\.)", t):
            row(f"Quaal's Feather Token ({n})", "Uncommon", "20 gp", f"Used once (an action): {eff[0].lower() + eff[1:]}", "1 (bundles 5/slot)")
    t = paras.get("Figurines of Wondrous Power", "")
    if t:
        for tier, value, body in re.findall(r"\*(Uncommon|Rare|Very Rare), ([\d,]+ [gs]p):\* (.*?)(?= \*|$)", t):
            for name, what, h, d in re.findall(r"([A-Z][\w ]+?), (an? [^(]+|two [^(]+|three [^(]+) \((\d+) h, (\d+) d\)", body):
                hours = f"{h} hour{'' if h == '1' else 's'}"
                row(f"Figurine of Wondrous Power ({name.strip()})", tier, value,
                    f"Throw it 60ft and speak its word (an action): it becomes {what.strip()} and obeys you for {hours} (or until it drops to 0 HP), then rests {d} days.", "1 (bundles 5/slot)")
    t = paras.get("Horns of Valhalla", "")
    if t:
        lead = t.split(":", 1)[0]
        for kind, n, rar, value in re.findall(r"(silver|brass|bronze|iron), (\d) \((?:(Rare|Very Rare), )?([\d,]+ [gs]p)\)", t):
            rar = rar or "Very Rare"
            extra = " Bronze or iron Berserkers attack a blower untrained in heavy armour." if kind in ("bronze", "iron") else ""
            row(f"Horn of Valhalla ({kind.title()})", rar, value, f"{lead}: {n} Berserkers.{extra}")
    t = paras.get("Ioun Stones", "")
    if t:
        lead = t.split(" *Rare", 1)[0].replace("5 to a slot. ", "")
        for tier, value, body in re.findall(r"\*(Rare|Very Rare), ([\d,]+ [gs]p):\* (.*?)(?= \*|$)", t):
            m = re.match(r"Agility, Fortitude, Insight, Intellect, Leadership or Strength \(\+1 to ([^)]*?), to 20 at most\); (.*)$", body)
            if m:
                attrs = [a.strip() for a in re.split(r", | or ", m.group(1))]
                for n, a in zip(["Agility", "Fortitude", "Insight", "Intellect", "Leadership", "Strength"], attrs):
                    row(f"Ioun Stone ({n})", tier, value, f"{lead} +1 to {a}, to 20 at most.", "1 (bundles 5/slot)")
                body = m.group(2)
            for n, eff in re.findall(r"([A-Z][\w ]+?) \(((?:[^()]|\([^()]*\))*)\)[;.]?", body):
                row(f"Ioun Stone ({n.strip()})", tier, value, f"{lead} {eff[0].upper() + eff[1:]}.", "1 (bundles 5/slot)")
    t = paras.get("Manuals and Tomes", "")
    if t:
        m = re.match(r"(Very Rare), ([\d,]+ [gs]p) each\. (.*?\.) (Manuals of .*)$", t)
        how = m.group(3).replace("Study one", "Study it").replace("its attribute", "{a}")
        for n, a in re.findall(r"(Gainful Exercise|Bodily Health|Quickness of Action|Clear Thought|Understanding|Leadership and Influence) \((\w+)\)", m.group(4)):
            kind = "Manual" if n in ("Gainful Exercise", "Bodily Health", "Quickness of Action") else "Tome"
            row(f"{kind} of {n}", m.group(1), m.group(2), how.replace("{a}", f"your {a}"))
    got = {k: sum(1 for r in rows if any(w in r for w in {"Belts of Giant Strength": ["Giant Strength"], "Elemental Vessels": ["Elementals"],
           "Feather Tokens": ["Feather Token"], "Figurines of Wondrous Power": ["Figurine"], "Horns of Valhalla": ["Horn of Valhalla"],
           "Ioun Stones": ["Ioun Stone"], "Manuals and Tomes": ["Manual of", "Tome of"]}[k])) for k in SET_KINDS if k in paras}
    assert all(got[k] == SET_KINDS[k] for k in got), f"M&T set items changed: {got}"
    return rows


def add_iconic(shop_path):
    if not os.path.exists(MT_TREASURE):
        return 0
    mt = open(MT_TREASURE, encoding="utf-8").read()
    cat = open(shop_path, encoding="utf-8").read()
    added = 0
    for mt_head, cat_head in ICONIC_SECTIONS:
        ms, cs = _section(mt, mt_head, "##"), _section(cat, cat_head, "###")
        if not ms or not cs:
            continue
        have = {_row_name(r) for r in _item_rows(cs.group(1))}
        new = [r for r in _item_rows(ms.group(1)) if _row_name(r) not in have]
        if mt_head == "Iconic Wondrous Items":
            new += [r for r in set_rows(mt) if _row_name(r) not in have]
        if not new:
            continue
        rows = _item_rows(cs.group(1))
        last = rows[-1]
        at = cs.start(1) + cs.group(1).index(last) + len(last)
        cat = cat[:at] + "\n" + "\n".join(new) + cat[at:]
        added += len(new)
    open(shop_path, "w", encoding="utf-8").write(cat)
    return added


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
    print("Iconic items added from M&T:", add_iconic(SHOP))
    for f in glob.glob(os.path.join(CLASSES, "*")):
        os.remove(f)
    classes_md = joined(open(src("III_Classes"), encoding="utf-8").read())
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

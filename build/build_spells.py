"""Spells and the Spellcasting journal from the Handbook's Book IV (books_md.SPELLS, v0.10.11)."""
import os, re
import docx
from lib import *
import books_md
import spell_damage, spell_saves
# Spells renamed in the books keep their compendium id (books v0.10.41, K49: the Warlock's Hex is Malediction).
RENAMED = {"Malediction": "Hex"}

CLASSES = {"Wiz": "Wizard", "Cle": "Cleric", "Ill": "Illusionist", "Dru": "Druid", "Sor": "Sorcerer", "Wit": "Witch",
           "Bar": "Bard", "War": "Warlock", "Mag": "Spellblade", "Spb": "Spellblade", "Nec": "Necromancer", "Pal": "Paladin"}
SAVES = {"Will": "will", "Reflex": "ref", "Fortitude": "fort"}
LEVELS = ["Cantrips", "1st Level", "2nd Level", "3rd Level", "4th Level", "5th Level", "6th Level", "7th Level", "8th Level", "9th Level"]
DTYPES = ["slashing", "piercing", "bludgeoning", "fire", "cold", "lightning", "thunder", "acid", "poison", "necrotic", "radiant", "psychic", "force"]

def _site_text(html):
    """The site's spell text as the compendium writes it: <b> becomes <strong>, and a plain copy for the parsers."""
    rich = re.sub(r"<(/?)b>", r"<\1strong>", html or "")
    return rich, re.sub(r"<[^>]+>", "", rich)


def build_items(icon):
    """Every spell, from the wiki's spells.json (plan step 1: the online books are the one source)."""
    import booksite as SITE
    spells = SITE.rules("spells.json")
    count = 0
    fols = {}
    for s in sorted(spells, key=lambda x: x["l"]):
        lvl = s["l"]
        if lvl not in fols:
            fols[lvl] = folder("spells", LEVELS[lvl], sort=lvl)
        name, school = re.sub(r"/\s+", "/", s["n"]), s["sch"]
        classes = [CLASSES.get(c, c) for c in s["cls"]]
        save = SAVES.get((s.get("sv") or "").strip(), "")
        comps = s.get("cp") or ""
        rich, text = _site_text(s.get("d"))
        rng = re.match(r"^(Range [^;.]+|Touch|Self|Personal)", text)
        conc = bool(re.search(r"\bconcentration\b", text, re.I))
        dmg, dtype, dnote = spell_damage.for_spell(name, text)
        save = save or spell_saves.SAVE_ADD.get(name, "")
        notes = [esc(dnote)] if dnote else []
        if s.get("rev"):
            notes.append("<strong>Reversible:</strong> may be cast as its opposite with the same slot.")
        if s.get("rare"):
            notes.append("<strong>Costly component:</strong> see Rare Spell Components in the Shopkeeper's Catalogue.")
        desc = f"<p>{rich}</p>" + "".join(f'<p class="arn-note">{n}</p>' for n in notes)
        desc += f'<p class="arn-note"><strong>Classes:</strong> {esc(", ".join(classes))}</p>'
        item("spells", name, "spell", {
            "description": desc, "source": {"book": "phb", "page": 0, "url": SITE.url("spell", name)},
            "level": lvl, "className": classes[0] if len(classes) == 1 else "",
            "classes": classes, "school": school.strip(),
            "castingTime": "1 action", "range": rng.group(1) if rng else "",
            "duration": "", "area": "", "components": comps.replace("· Ritual", "").strip(" ·"),
            "concentration": conc, "ritual": bool(s.get("rit")), "prepared": False,
            "save": save, "saveEffect": spell_saves.save_effect(name, text, save), "damage": dmg, "damageType": dtype,
            "reversible": bool(s.get("rev")), "costly": bool(s.get("rare"))
        }, icon("spell", school.strip()), folder=fols[lvl], sort=count, key=RENAMED.get(name, name))
        count += 1
    return count


def build(icon):
    count = build_items(icon)
    if not os.path.exists(books_md.SPELLS):
        return count  # the Spellcasting journal still comes from the Word copy until plan step 2
    d = docx.Document(books_md.SPELLS)
    # Journal: the rules text, with the spell tables left to the compendium.
    pages = []
    cur_title = "Spellcasting in Arneyan"
    buf = HtmlBuf()
    first = True
    for kind, obj, info in walk_docx(d):
        if kind == "table":
            rows = obj
            if rows[0][:2] == ["Spell", "Classes"]:
                continue
            buf.add(table_html(rows))
            continue
        p, t = obj, info["text"]
        # (the master spell list's own title, a Title in the old Word file and plain text, twice, in the v0.10.11 Markdown)
        if info["style"] in ("Title",) or t in ("Arneyan Campaign Setting", "Arneyan Master Spell List") or (first and t == "Spellcasting in Arneyan"):
            first = False
            continue
        if info["style"] == "Heading 1":
            if not buf.empty():
                pages.append((cur_title, buf.html()))
            cur_title = re.sub(r"^[IVX]+\.\s*", "", t)
            buf = HtmlBuf()
            continue
        if info["style"] == "Heading 2":
            buf.add(f"<h2>{esc(t)}</h2>")
        elif info["list"]:
            buf.li(runs_html(p), info["lvl"])
        else:
            buf.add(f"<p>{runs_html(p)}</p>")
    if not buf.empty():
        pages.append((cur_title, buf.html()))
    pages.append(("Spell Lists", "<p>Every spell is in the <strong>Spells</strong> compendium, sorted by level. Drag a spell onto a character sheet to add it.</p>"))
    journal("rules", "Book IV: Spellcasting", pages, sort=4)

"""Spells and the Spellcasting journal from Spellcasting_in_Arneyan_v2.docx."""
import re
import docx
from lib import *
import spell_damage, spell_saves

CLASSES = {"Wiz": "Wizard", "Cle": "Cleric", "Ill": "Illusionist", "Dru": "Druid", "Sor": "Sorcerer", "Wit": "Witch",
           "Bar": "Bard", "War": "Warlock", "Mag": "Magus", "Nec": "Necromancer", "Pal": "Paladin"}
SAVES = {"Will": "will", "Reflex": "ref", "Fortitude": "fort"}
LEVELS = ["Cantrips", "1st Level", "2nd Level", "3rd Level", "4th Level", "5th Level", "6th Level", "7th Level", "8th Level", "9th Level"]
DTYPES = ["slashing", "piercing", "bludgeoning", "fire", "cold", "lightning", "thunder", "acid", "poison", "necrotic", "radiant", "psychic", "force"]

def build(icon):
    d = docx.Document("/tmp/hb/Spellcasting_in_Arneyan_v2.docx")
    spell_tables = [t for t in d.tables if tbl_rows(t)[0][:2] == ["Spell", "Classes"]]
    count = 0
    for lvl, t in enumerate(spell_tables):
        fol = folder("spells", LEVELS[lvl], sort=lvl)
        for r in tbl_rows(t)[1:]:
            if len(r) < 5 or not r[0]:
                continue
            first, _, school = r[0].partition("\n")
            marks = "".join(re.findall(r"[*‡]", first))
            name = re.sub(r"[*‡†]+", "", first).strip()
            classes = [CLASSES.get(a.strip(), a.strip()) for a in r[1].split(",") if a.strip()]
            save = SAVES.get(r[2].strip(), "")
            comps = r[3]
            text = fix(r[4])
            rng = re.match(r"^(Range [^;.]+|Touch|Self|Personal)", text)
            conc = bool(re.search(r"\bconcentration\b", text, re.I))
            dmg, dtype, dnote = spell_damage.for_spell(name, text)
            save = save or spell_saves.SAVE_ADD.get(name, "")
            notes = [esc(dnote)] if dnote else []
            if "*" in marks:
                notes.append("<strong>Reversible:</strong> may be cast as its opposite with the same slot.")
            if "‡" in marks:
                notes.append("<strong>Costly component:</strong> see Rare Spell Components in the Shopkeeper's Catalogue.")
            desc = f"<p>{esc(text)}</p>" + "".join(f'<p class="arn-note">{n}</p>' for n in notes)
            desc += f'<p class="arn-note"><strong>Classes:</strong> {esc(", ".join(classes))}</p>'
            item("spells", name, "spell", {
                "description": desc, "source": {"book": "phb", "page": 0},
                "level": lvl, "className": classes[0] if len(classes) == 1 else "",
                "classes": classes, "school": school.strip(),
                "castingTime": "1 action", "range": rng.group(1) if rng else "",
                "duration": "", "area": "", "components": comps.replace("· Ritual", "").strip(" ·"),
                "concentration": conc, "ritual": "Ritual" in comps, "prepared": False,
                "save": save, "saveEffect": spell_saves.save_effect(name, text, save), "damage": dmg, "damageType": dtype,
                "reversible": "*" in marks, "costly": "‡" in marks
            }, icon("spell", school.strip()), folder=fol, sort=count)
            count += 1

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
        if info["style"] in ("Title",) or t in ("Arneyan Campaign Setting",) or (first and t == "Spellcasting in Arneyan"):
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

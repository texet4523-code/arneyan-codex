"""Ancestries, feats, skills and the Character Creation journal from cc2.md."""
import re
from lib import *
import books_md

ABIL = {"Str": "str", "Dex": "dex", "Con": "con", "Int": "int", "Wis": "wis", "Cha": "cha",
        "Strength": "str", "Dexterity": "dex", "Constitution": "con", "Intelligence": "int", "Wisdom": "wis", "Charisma": "cha"}

def build(icon):
    md = open(books_md.CC).read()
    lines = md.split("\n")

    # ---------------- Ancestries
    start = md.index("# Full Ancestry Reference")
    end = md.index("# Attribute Bonuses & Penalties")
    block = md[start:end]
    for i, (name, body) in enumerate(md_sections(block, 2)):
        stat = re.search(r"\*\*(Size[^*]+)\*\*", body)
        sline = stat.group(1) if stat else ""
        size = "medium"
        sm = re.search(r"Size\s+([A-Za-z /]+?)\s*(?:\(|•)", sline)
        if sm:
            sizes = sm.group(1).lower()
            size = "small" if sizes.strip() == "small" else "large" if sizes.strip() == "large" else "medium"
        spd = re.search(r"Speed\s+(\d+)", sline)
        vis = re.search(r"(Darkvision \d+ft|Low-light|Normal vision|Superior darkvision \d+ft)", sline, re.I)
        attrs = sline.split("•")[-1].strip() if "•" in sline else ""
        item("ancestries", plain(name), "ancestry", {
            "description": md_to_html(body),
            "source": {"book": "phb", "page": 0},
            "size": size, "speed": int(spd.group(1)) if spd else 30,
            "vision": vis.group(1) if vis else "", "attributes": attrs
        }, icon("ancestry", name), sort=i)

    # ---------------- Feats
    fstart = md.index("# Class-Bound Feat Paths")
    fend = md.index("# Skills (NWP)", fstart)
    fblock = md[fstart:fend]
    feats = {}
    for pi, (path, body) in enumerate(md_sections(fblock, 2)):
        pname = re.sub(r"^[IVX]+\.\s*", "", path).split("(")[0].strip()
        fol = folder("feats", pname, sort=pi)
        avail = re.search(r"^\*(Available to:[^*]+|Open to all[^*]+)\*", body, re.M)
        n = 0
        for ln in body.split("\n"):
            m = re.match(r"^\*\*(.+?)\*\*:?\s*(.*)$", ln.strip())
            if not m:
                continue
            fname = plain(m.group(1)).rstrip(":").strip()
            rest = m.group(2).strip()
            fname_clean = re.sub(r"\s*\((?:[A-Z][a-z]+(?:\s*/\s*[A-Z][a-z]+)*)(?:\s*—[^)]*)?\)\s*$", "", fname).strip()
            desc = f"<p>{md_inline(rest)}</p>"
            if fname != fname_clean:
                desc = f"<p><em>{esc(fname[len(fname_clean):].strip())}</em></p>" + desc
            prev = feats.get(fname_clean)
            also = ([prev["path"]] + prev["also"]) if prev else []
            notes = (prev["notes"] if prev else []) + ([avail.group(1)] if avail else [])
            # Listed in more than one Path (HB v0.10.61): one note naming every class it is open to, each once.
            if len(notes) > 1 and all(n_.startswith("Available to:") for n_ in notes):
                who = []
                for n_ in notes:
                    for w in re.split(r",\s*(?:and\s+)?|\s+and\s+", n_[len("Available to:"):].strip().rstrip(".")):
                        if w.strip() and w.strip() not in who:
                            who.append(w.strip())
                desc += f'<p class="arn-note">{md_inline("Available to: " + ", ".join(who[:-1]) + ", and " + who[-1] + ".")}</p>'
            elif notes:
                desc += "".join(f'<p class="arn-note">{md_inline(n_)}</p>' for n_ in notes)
            feats[fname_clean] = {"desc": desc, "path": pname, "also": also, "fol": fol, "n": n, "pname": pname, "notes": notes}
            n += 1
    for fname_clean, f in feats.items():
        item("feats", fname_clean, "feat", {
            "description": f["desc"], "source": {"book": "phb", "page": 0},
            "path": f["path"], "alsoPaths": f["also"], "levelTaken": 0
        }, icon("feat", f["pname"]), folder=f["fol"], sort=f["n"])

    # ---------------- Skills (NWP)
    sstart = md.index("# Master Proficiency List")
    send = md.index("# Languages of Veradyna", sstart)
    sblock = md[sstart:send]
    for ai, (attr, body) in enumerate(md_sections(sblock, 2)):
        key = ABIL.get(attr.strip(), "int")
        fol = folder("skills", attr.strip(), sort=ai)
        for row in re.findall(r"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$", body, re.M):
            if row[0] in ("Skill",) or set(row[0]) <= set("-: "):
                continue
            # Books v0.10.49 (K57): Mountaineering is now Climb; it keeps its id.
            item("skills", plain(row[0]), "skill", {
                "description": f"<p>{md_inline(row[1])}</p>", "source": {"book": "phb", "page": 0},
                "ability": key, "tier": "trained"
            }, icon("skill", key), folder=fol, key={"Climb": "Mountaineering"}.get(plain(row[0])))

    # ---------------- Journal: everything in Character Creation, one page per top-level section
    pages = []
    for title, body in md_sections(md, 1):
        if title in ("Character Creation",) and not body.strip():
            continue
        pages.append((plain(title), md_to_html(body)))
    # Merge duplicate summary/full headings: keep the longer one.
    seen = {}
    for t, h in pages:
        if t not in seen or len(h) > len(seen[t]):
            seen[t] = h
    order = []
    for t, _ in pages:
        if t not in order:
            order.append(t)
    journal("rules", "Book II: Character Creation", [(t, seen[t]) for t in order if seen[t].strip()], sort=2)

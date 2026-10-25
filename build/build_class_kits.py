"""Witch Patrons and Artificer Kits as kit items (like the Cleric's deity kits), in the Witch and Artificer folders
of the Kits compendium. build_classes.py reads kits from bold "Kit —" paragraphs, which these two classes don't
use: the Witch's Patrons are list items ("Patron — Mother Loretta", then Buff (1st), Curse (6th), Physical Change
(12th)) and the Artificer's Kits are headings ("Kit — Alchemist", then Kit Feature (1st/3rd/7th/11th), Lasting
Work (15th), Magnum Opus (24th)). Each feature is granted at its level by the kit system."""
import os, re
import docx
from lib import *

import books_md
SRC = books_md.CLASSES
LVL = re.compile(r"\((\d+)(?:st|nd|rd|th)\)")


def _feature(label, rest, level_default=1):
    """("Kit Feature (1st)", "Infuse Item: as an action, ...") -> feature dict."""
    lm = LVL.search(label)
    level = int(lm.group(1)) if lm else level_default
    kind = LVL.sub("", label).strip()
    name, body = kind, rest
    m = re.match(r"^([^:]{2,60}):\s*(.+)$", rest, re.S)
    if kind == "Kit Feature" and m:
        name, body = m.group(1).strip(), m.group(2).strip()
    elif kind in ("Lasting Work", "Magnum Opus") and m:
        sub = re.sub(r"^(Lasting Work|Magnum Opus)\s*[—–-]\s*", "", m.group(1).strip())
        name, body = f"{kind}: {sub}", m.group(2).strip()
    elif kind in ("Buff", "Curse"):
        name = f"Patron {kind}"
    body = body[:1].upper() + body[1:]
    return {"name": name.replace(" — ", ": "), "level": level, "description": f"<p>{md_inline(body)}</p>"}


def _split(p):
    """Bold lead-in label and the rest of a paragraph: ("Buff (1st)", "Once per day, ...")."""
    lead = ""
    for r in p.runs:
        if r.bold or not r.text.strip():
            lead += r.text
        else:
            break
    t = p.text.strip()
    m = re.match(r"^\s*([^:]{1,40}?)\s*\((\d+(?:st|nd|rd|th))\)\s*:\s*(.+)$", t, re.S)
    if lead.strip() and m:
        return f"{m.group(1).strip()} ({m.group(2)})", m.group(3).strip()
    return None, None


def witch():
    d = docx.Document(os.path.join(SRC, "Witch.docx"))
    kits, cur, on = [], None, False
    for kind, obj, info in walk_docx(d):
        if kind != "p":
            continue
        t = info["text"]
        if info["style"] == "Heading 1":
            on = t.strip() == "Patrons"
            cur = None
            continue
        if not on:
            continue
        m = re.match(r"^Patron\s*(?:[—–-]|:)\s+(.+)$", t)
        if m:
            cur = {"name": f"Patron: {m.group(1).strip()}", "intro": [], "features": []}
            kits.append(cur)
            continue
        if not cur:
            continue
        lab, rest = _split(obj)
        if lab:
            cur["features"].append(_feature(lab, rest))
        else:
            cur["intro"].append(f"<p>{runs_html(obj)}</p>")
    return kits


def artificer():
    d = docx.Document(os.path.join(SRC, "Artificer.docx"))
    kits, cur, known, section, sub = [], None, {}, "", None
    for kind, obj, info in walk_docx(d):
        if kind != "p":
            continue
        t, style = info["text"], info["style"]
        if style == "Heading 1":
            section, cur, sub = t.strip(), None, None
            continue
        if style == "Heading 2":
            m = re.match(r"^Kit\s*(?:[—–-]|:)\s+(.+)$", t)
            cur = {"name": m.group(1).strip(), "intro": [], "features": []} if m and section.startswith("Kits") else None
            if cur:
                kits.append(cur)
            # The Workshop's known lists: "Infuser — Known Infusions", "Alchemist — Known Formulas".
            k = re.match(r"^(Infuser|Construct Engineer|Gadgeteer|Alchemist)\s*(?:[—–-]|:)\s+(.+)$", t)
            sub = (k.group(1), k.group(2).strip()) if k and section.startswith("The Artificer") else None
            if sub:
                known[sub[0]] = {"title": sub[1], "html": HtmlBuf()}
            continue
        if cur:
            lab, rest = _split(obj)
            if lab:
                cur["features"].append(_feature(lab, rest))
            else:
                cur["intro"].append(f"<p>{runs_html(obj)}</p>")
        elif sub:
            buf = known[sub[0]]["html"]
            if info["bold"] and not info["list"]:
                buf.add(f"<h4>{esc(fix(t))}</h4>")
            elif info["list"]:
                buf.li(runs_html(obj), info["lvl"])
            else:
                buf.add(f"<p>{runs_html(obj)}</p>")
    for k in kits:
        kn = known.get(k["name"])
        if kn:
            k["known"] = f"<h3>{esc(fix(kn['title']))}</h3>{kn['html'].html()}"
    return kits


def features_html(feats):
    return "<ul>" + "".join(f"<li><strong>{esc(f['name'])}</strong> ({ordinal(f['level'])}): {re.sub(r'^<p>|</p>$', '', f['description'])}</li>" for f in feats) + "</ul>"


def ordinal(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def build(icon_for_class):
    out = {}
    for cls, kits in (("Witch", witch()), ("Artificer", artificer())):
        fol = folder("kits", cls)
        for i, k in enumerate(kits):
            desc = "".join(k["intro"]) + features_html(k["features"]) + k.get("known", "")
            item("kits", f"{k['name']} ({cls})", "kit",
                 {"description": desc, "source": {"book": "phb", "page": 0}, "className": cls, "features": k["features"]},
                 icon_for_class(cls, k["name"]), folder=fol, sort=i)
        out[cls] = len(kits)
    return out

"""Keeps & Kingdoms in Foundry (R-F28, K117, K119): Chapter 6's creature blocks as actors in their own compendium
(kk-monsters), and every chapter as a read-only rules journal (kk-rules). No automation for strongholds, units or
intrigue. The source is the MCDM Builder's whole-book markdown (/tmp/hb/kk/Keeps_and_Kingdoms.md); it names its
source books only in the small print (K104), which the first journal page carries."""
import html, os, re
from lib import journal, md_to_html, md_sections
import build_monsters

SRC = "/tmp/hb/kk/Keeps_and_Kingdoms.md"
SMALL_PRINT = ("Adapted for home play from MCDM's <em>Strongholds &amp; Followers</em>, <em>Kingdoms &amp; Warfare</em>, "
               "<em>Flee, Mortals!</em> and <em>Where Evil Lives</em>, rewritten for The Arneyan Codex. "
               "Not an MCDM product, and not for sale or distribution.")
# Modifier -> a score with that modifier on the Arneyan table (the blocks give modifiers; saves come from the block).
SCORE = {-4: 2, -3: 3, -2: 5, -1: 7, 0: 10, 1: 14, 2: 16, 3: 18, 4: 20, 5: 22, 6: 24, 7: 26, 8: 28, 9: 30}
ATTRS = ("Str", "Dex", "Con", "Int", "Wis", "Cha")


def source():
    t = open(SRC, encoding="utf-8").read()
    ver = re.search(r"^- \*\*v(\d+\.\d+\.\d+)", t, re.M)
    return t, ver.group(1) if ver else "?"


def plain(s):
    return re.sub(r"\*+", "", s).strip()


def num(s):
    return int(s.replace("−", "-").replace("+", ""))


def atk_line(s):
    """K&K's attack line in the M&T form: "scimitar ×2 +6 (...)" -> "scimitar +6 (...) ×2"; "and" and "; or" split
    attacks; "80ft/320ft" -> "80/320ft"; "or a trap (below)" goes (the ability says it)."""
    s = s.replace("−", "-")
    s = re.sub(r"(\d+)ft/(\d+)ft", r"\1/\2ft", s)
    out, depth, buf = [], 0, ""
    i = 0
    while i < len(s):
        c = s[i]
        depth += c == "("
        depth -= c == ")"
        for sep in ("; or ", ", or ", " or ", " and ", ", "):
            if depth == 0 and s.startswith(sep, i):
                out.append((buf.strip(), sep.strip(" ;,") == "or"))
                buf = ""
                i += len(sep)
                break
        else:
            buf += c
            i += 1
            continue
    out.append((buf.strip(), False))
    segs, alt_next = [], False
    for seg, is_or in out:
        seg = re.sub(r"^or\s+", "", seg)
        if not seg or seg.endswith("(below)"):
            alt_next = is_or
            continue
        m = re.match(r"(.+?)\s+×(\d+)\s+([+-]\d+.*)$", seg)
        if m:
            seg = f"{m.group(1)} {m.group(3)} ×{m.group(2)}"
        segs.append(("or " if alt_next else "") + seg)
        alt_next = is_or
    return ", ".join(segs)


def blocks(md):
    """Chapter 6's creatures as build_monsters.load() makes them: [{name, type, cl, f, sp, gm, group}]."""
    ch = md[md.index("# Chapter 6"):]
    ch = ch.split("\n## Changelog")[0]
    out = []
    for group, body in md_sections(ch, 2):
        if not re.search(r"^\*\*.+ · Level", body, re.M):
            continue
        for b in re.split(r"\n(?=\*\*[^*\n]+ · Level)", body):
            head = re.match(r"\*\*(.+?) · Level (\S+)(?: (solo|minion|leader|support))?(?: [a-z]+)? · (.+?)\*\*", b.strip())
            if not head:
                continue
            name, lvl, role, typ = head.group(1), head.group(2), head.group(3) or "", head.group(4)
            m = {"name": name, "type": typ, "cl": f"{lvl} {role}".strip(), "f": {}, "sp": [], "gm": "", "group": group, "refs": []}
            for ln in b.strip().split("\n")[1:]:
                ln = ln.strip()
                if ln.startswith("*") and not ln.startswith("**") and ln.endswith("*"):
                    m["gm"] = ln.strip("*").strip()
                    continue
                if not ln.startswith("- "):
                    continue
                ln = ln[2:].strip()
                if ln.startswith("*") and not ln.startswith("**") and ln.endswith("*"):
                    m["gm"] = ln.strip("*").strip()
                    continue
                stat = re.match(r"\*\*(HD|HP|Attributes|Saves|Skills|Atk|Resistance)\*\* ", ln)
                if stat:
                    for part in re.split(r" · (?=\*\*)", ln):
                        k, _, v = part.partition("** ")
                        k, v = k.strip("*"), v.strip()
                        if k == "HD":
                            hd = re.match(r"(\S+)\s*\((\d+) HP\)", v)
                            m["f"]["hd"], m["f"]["hp"] = hd.group(1), hd.group(2)
                        elif k == "HP":
                            m["f"]["hp"] = re.match(r"\d+", v).group(0)
                        elif k == "AC":
                            m["f"]["ac"] = v
                        elif k == "Move":
                            m["f"]["mv"] = v
                        elif k == "Attributes":
                            mods = dict(re.findall(r"(Str|Dex|Con|Int|Wis|Cha) ([+−-]\d+)", v))
                            m["f"]["ab"] = " ".join(str(SCORE[max(-4, min(9, num(mods[a])))]) for a in ATTRS)
                        elif k == "Saves":
                            m["f"]["svx"] = v.replace("−", "-")
                        elif k == "Morale":
                            m["f"]["mor"] = "12" if v.startswith("never") else v   # mindless: never breaks, as M&T's undead
                        elif k == "Treasure":
                            m["f"]["tr"] = v
                        elif k == "No.":
                            m["f"]["no"] = v
                        elif k == "Skills":
                            m["f"]["sk"] = v
                        elif k == "Atk":
                            m["f"]["atk"] = atk_line(v)
                        elif k == "Resistance":
                            m["sp"].append(f"Resistance {v}.")
                    continue
                ref = re.match(r"((?:\*\*[^*]+\*\*(?:,| and)?\s*)+),? as the (\w+)\.$", ln)
                if ref:
                    m["refs"].append((re.findall(r"\*\*([^*]+)\*\*", ref.group(1)), ref.group(2)))
                    continue
                sp = ln.replace("**", "").strip()   # italics stay, as in the M&T sources
                # "Toxic Bubble (once per day): it blows..." -> "Toxic Bubble: Once per day, it blows..." (M&T's form, so
                # the uses counter reads it); every ability's text starts with a capital, as M&T's do.
                od = re.match(r"([^:]+?) \(once per day\):\s*(.*)$", sp)
                if od:
                    sp = f"{od.group(1)}: Once per day, {od.group(2)}"
                sp = re.sub(r"^([^:]{1,60}:\s*)([a-z])", lambda x: x.group(1) + x.group(2).upper(), sp)
                m["sp"].append(sp)
            out.append(m)
    # "**Amphibious** and **Toxic Skin**, as the blade.": copy those abilities from the block named.
    for m in out:
        for names, who in m.pop("refs"):
            src = next((o for o in out if o["group"] == m["group"] and o["name"].lower().endswith(who.lower())), None)
            assert src, f"{m['name']}: no '{who}' to copy from"
            for n in names:
                line = next((x for x in src["sp"] if x.startswith(n + ":") or x.startswith(n + " (")), None)
                assert line, f"{m['name']}: {n} not on the {who}"
                m["sp"].append(line)
    return out


def journals(md, ver):
    """One read-only journal per chapter, a page per section; the creatures' sections point to their actors."""
    md = md.split("\n## Changelog")[0]
    made = 0
    for k, (title, body) in enumerate(md_sections(md, 1)):
        pages = []
        if k == 0:
            pages.append(("About Keeps & Kingdoms",
                          f"<p><strong>Keeps &amp; Kingdoms</strong>, a companion for The Arneyan Codex. Version {html.escape(ver)}.</p>"
                          "<p>Rules to read and run by hand: strongholds and followers, warfare, domains and intrigue, and "
                          "monsters. The creatures are actors in the <strong>Keeps &amp; Kingdoms: Monsters</strong> compendium.</p>"
                          f"<p class=\"arn-note\">{SMALL_PRINT}</p>"))
        intro = body.split("\n## ")[0].strip()
        if intro:
            pages.append((title, md_to_html(intro.replace("\n  - ", "\n    - "))))
        for st, sb in md_sections(body, 2):
            if re.search(r"^\*\*.+ · Level", sb, re.M):
                lead = sb.split("\n**")[0].strip()
                names = re.findall(r"^\*\*(.+?) · Level", sb, re.M)
                sb = lead + "\n\nIn the **Keeps & Kingdoms: Monsters** compendium: " + ", ".join(names) + "."
            pages.append((st, md_to_html(sb.replace("\n  - ", "\n    - "))))
        journal("kk-rules", title, pages, sort=(k + 1) * 100)
        made += 1
    return made


def build():
    if not os.path.exists(SRC):
        print(f"kk: WARNING no {SRC}: Keeps & Kingdoms is not built")
        return 0, 0
    md, ver = source()
    mons = blocks(md)
    n = build_monsters.build(pack="kk-monsters", entries=mons)
    return n, journals(md, ver)

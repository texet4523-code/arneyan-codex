"""Cosmic alignment on the kits (books v0.10.19 B4 and v0.10.20; board B-F6, B-W1).

Book II: a Cleric, Paladin or Battle Priest holds their god's alignment as their Allegiance while favoured, and a
Warlock their patron's. The books leave each god's alignment and tenets to the World of Arneyan wiki, so each deity
and patron kit gets:
- system.alignment: the wiki's alignment (data/b4_powers.json); archdevils and demon lords with none on the wiki hold
  their kind's by nature (M&T p.4). Left blank where neither says (the sheet then asks the GM).
- flags.arneyan.wiki: the god's or patron's wiki page, and a line in the description pointing at it (B-W1: tenets).
Runs before the pregens copy their kits.
"""
import glob, json, os, re
import lib

HERE = os.path.dirname(os.path.abspath(__file__))
WIKI = "https://app.kanka.io/w/198952/entities/{}"
POWERS = json.load(open(os.path.join(HERE, "data", "b4_powers.json"), encoding="utf-8"))["powers"]
NOTE = "arn-b4-note"


def key_of(kit_name):
    """The god's or patron's names a kit is for: "Deity: Brigh (The Crafted Turn) (Cleric)" -> ["Brigh"];
    "Belial & Fierna (Warlock)" -> ["Belial", "Fierna"]; "The Raven Queen" -> ["Raven Queen"]."""
    n = re.sub(r"^deity:\s*", "", kit_name, flags=re.I)
    n = re.sub(r"\s*\((cleric|paladin|warlock)\)\s*$", "", n, flags=re.I)
    n = re.sub(r"\s*\(.*?\)\s*$", "", n).strip()
    n = re.sub(r",.*$", "", n)
    names = [x.strip() for x in re.split(r"\s*&\s*", n)]
    out = []
    for x in names:
        x = re.sub(r"^the\s+", "", x, flags=re.I)
        if x in POWERS:
            out.append(x)
            continue
        first = next((k for k in POWERS if x.lower().startswith(k.lower())), None)
        if first:
            out.append(first)
    return out


def apply(doc):
    s = doc.get("system") or {}
    name = doc.get("name", "")
    deity = name.lower().startswith("deity:")
    patron = "warlock" in str(s.get("className", "")).lower()
    if not (deity or patron):
        return False
    keys = key_of(name)
    if not keys:
        return False
    found = [POWERS[k] for k in keys]
    als = {p["alignment"] for p in found if p["alignment"]}
    s["alignment"] = als.pop() if len(als) == 1 and all(p["alignment"] for p in found) else ""
    doc.setdefault("flags", {}).setdefault("arneyan", {})["wiki"] = WIKI.format(found[0]["entity"])
    links = " and ".join(f'<a href="{WIKI.format(p["entity"])}">{p["wiki"]}</a>' for p in found)
    if deity:
        tail = (f"<strong>Allegiance:</strong> {s['alignment']}, the god's alignment, held while the god favours you. "
                if s["alignment"] else "")
        line = f'<p class="arn-note {NOTE}">{tail}<strong>Tenets:</strong> on {links} in the World of Arneyan wiki.</p>'
    else:
        tail = f"<strong>Allegiance:</strong> {s['alignment']}, the patron's alignment. " if s["alignment"] else ""
        line = f'<p class="arn-note {NOTE}">{tail}<strong>Lore:</strong> {links} in the World of Arneyan wiki.</p>'
    desc = re.sub(rf'<p class="arn-note {NOTE}">.*?</p>', "", s.get("description", ""))
    s["description"] = desc + line
    return True


def build():
    done = 0
    for f in sorted(glob.glob(os.path.join(lib.OUT, "kits", "*.json"))):
        d = json.load(open(f, encoding="utf-8"))
        if apply(d):
            json.dump(d, open(f, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
            done += 1
    return done

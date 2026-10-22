"""Readable descriptions (Kieran, 21 Oct 2026): "break things up more ... if it becomes a fat paragraph it gets too
hard to read and I like key things in the text to be bold". The wording is the books'; only the layout changes:

- A whole sentence in bold (Wild Shape's effect) keeps only its label in bold ("Effect:").
- A long paragraph or list point (over FAT characters, three sentences or more) becomes short points, Nature Lore
  style: a paragraph keeps its first sentence and lists the rest; a list point becomes one point per sentence.
- Key terms are bold: dice, DCs, distances, durations, uses per day, Advantage and Disadvantage, saves, HP and
  conditions.

Runs last over the item compendiums (and the items inside pregens and monsters); running it again changes nothing."""
import glob, json, os, re
import lib

PACKS = ["class-features", "feats", "actions", "kits", "spells", "equipment", "ancestries", "classes", "skills"]
EMBEDDED = ["pregens", "monsters"]
FAT = 260
LONG_BOLD = 90

ABBREV = {"e.g", "i.e", "vs", "etc", "p", "pp", "approx", "st", "mr", "mrs", "dr", "cf", "lvl", "cl", "hd"}
CONDITIONS = ["Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralysed", "Petrified",
              "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious", "Exhausted", "Confused", "Slowed", "Dazed", "Sickened", "Fatigued"]
NUM = r"(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)"
KEY_TERMS = re.compile("|".join([
    r"\b\d*d\d+(?:\s*[+−-]\s*\d+)?(?:\s*(?:per|/)\s*level)?\b",          # 2d6, 1d6 per level
    r"\bDC\s?\d+\b",
    r"\b\d+\s?(?:ft|feet|miles?)(?:\s*(?:radius|cone|line|cube))?\b",
    rf"\b{NUM}\s(?:rounds?|minutes?|hours?|days?|weeks?|turns?)(?:\sper\s(?:caster\s)?level)?\b",
    r"\b(?:once|twice|(?:three|four|five|six)\stimes)\s(?:per|a)\s(?:day|round|week)\b",
    r"\b\d+/(?:day|round|week)\b",
    r"\b(?:Advantage|Disadvantage)\b",
    r"\btemporary HP\b",
    r"\b\d+\sHP\b",
    r"\b(?:Fortitude|Reflex|Will)\s(?:save|saves|negates|halves|partial|for half)\b",
    r"\b(?:" + "|".join(CONDITIONS) + r")\b",
]))

TAG = re.compile(r"<[^>]+>")


def text_of(html):
    return re.sub(r"\s+", " ", TAG.sub("", html)).strip()


def sentences_in(text):
    return len(re.findall(r"[.!?](?:\s|$)", text))


# ---------------------------------------------------------------- 1. long bold

def unbold_long(html):
    def fix(m):
        tag, inner = m.group(1), m.group(2)
        if len(text_of(inner)) <= LONG_BOLD:
            return m.group(0)
        lab = re.match(r"(\s*[^<:.\[@]{1,40}:)(\s*)(.*)$", inner, re.S)
        if lab:
            return f"<{tag}>{lab.group(1)}</{tag}>{lab.group(2) or ' '}{lab.group(3)}"
        return inner
    return re.sub(r"<(strong|b)>((?:(?!</?\1>).)*?)</\1>", fix, html, flags=re.S)


# ---------------------------------------------------------------- 2. fat paragraphs

INLINE = {"strong", "b", "em", "i", "a", "span", "u", "code", "sup", "sub", "mark"}


def split_sentences(html):
    """Split inline HTML into sentences, never inside a tag, brackets or an @UUID[...]{...} link."""
    out, buf, i, n = [], [], 0, len(html)
    depth, open_tags = 0, []
    while i < n:
        c = html[i]
        if c == "<":
            j = html.find(">", i)
            if j < 0:
                buf.append(html[i:]); break
            tag = html[i:j + 1]
            m = re.match(r"<\s*(/)?\s*([a-zA-Z0-9]+)", tag)
            if m and m.group(2).lower() in INLINE and not tag.endswith("/>"):
                if m.group(1):
                    if open_tags and open_tags[-1] == m.group(2).lower():
                        open_tags.pop()
                else:
                    open_tags.append(m.group(2).lower())
            buf.append(tag); i = j + 1; continue
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth = max(0, depth - 1)
        buf.append(c)
        if c in ".!?" and depth == 0 and not open_tags:
            k = i + 1
            while k < n and html[k] in "\"'’”":
                buf.append(html[k]); k += 1
            if k < n and html[k] == " ":
                rest = html[k:].lstrip()
                word = re.search(r"([A-Za-z.]+)$", text_of("".join(buf))[:-1])
                prev = (word.group(1).lower().rstrip(".") if word else "")
                # The next sentence's first letter, read past any tags (so bolding never changes where it splits).
                nxt = text_of(rest)[:1]
                if nxt and (nxt.isupper() or nxt in "(\"'") and prev not in ABBREV:
                    out.append("".join(buf).strip()); buf = []
                    i = k; continue
            i = k; continue
        i += 1
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    # A scrap too short to stand alone goes back on the sentence before it.
    merged = []
    for s in out:
        if merged and len(text_of(s)) < 20:
            merged[-1] += " " + s
        else:
            merged.append(s)
    return merged


def is_fat(inner):
    t = text_of(inner)
    return len(t) > FAT and sentences_in(t) >= 3 and not re.search(r"<(?:ul|ol|table|p|div|h\d)\b", inner)


def para_of(whole, attrs, inner, fn):
    return fn(whole, attrs, inner)


def split_fat(html):
    def para(whole, attrs, inner):
        if not is_fat(inner):
            return whole
        parts = split_sentences(inner)
        if len(parts) < 3:
            return whole
        return f"<p{attrs}>{parts[0]}</p><ul>" + "".join(f"<li>{s}</li>" for s in parts[1:]) + "</ul>"

    def point(whole, attrs, inner):
        if not is_fat(inner):
            return whole
        parts = split_sentences(inner)
        if len(parts) < 3:
            return whole
        return "".join(f"<li{attrs}>{s}</li>" for s in parts)

    html = re.sub(r"<p(\s[^>]*)?>((?:(?!</?p[\s>]).)*?)</p>", lambda m: para_of(m.group(0), m.group(1) or "", m.group(2), para), html, flags=re.S)
    html = re.sub(r"<li(\s[^>]*)?>((?:(?!</?li[\s>]).)*?)</li>", lambda m: para_of(m.group(0), m.group(1) or "", m.group(2), point), html, flags=re.S)
    return html


# ---------------------------------------------------------------- 3. key terms in bold

def bold_terms(html):
    """Bold key terms in the text only: not in tags, not already bold, not in links, headings or inline rolls."""
    out, i, n = [], 0, len(html)
    skip = []   # open tags whose text is left alone
    SKIP = {"strong", "b", "a", "h1", "h2", "h3", "h4", "h5", "h6", "code", "th"}
    while i < n:
        if html[i] == "<":
            j = html.find(">", i)
            if j < 0:
                out.append(html[i:]); break
            tag = html[i:j + 1]
            m = re.match(r"<\s*(/)?\s*([a-zA-Z0-9]+)", tag)
            if m and m.group(2).lower() in SKIP and not tag.endswith("/>"):
                if m.group(1):
                    if m.group(2).lower() in skip:
                        skip.remove(m.group(2).lower())
                else:
                    skip.append(m.group(2).lower())
            out.append(tag); i = j + 1; continue
        j = html.find("<", i)
        j = n if j < 0 else j
        text = html[i:j]
        if not skip:
            # Leave @UUID[...]{...} links and [[...]] inline rolls whole.
            pieces = re.split(r"(@\w+\[[^\]]*\](?:\{[^}]*\})?|\[\[[^\]]*\]\])", text)
            text = "".join(p if k % 2 else KEY_TERMS.sub(lambda mm: f"<strong>{mm.group(0)}</strong>", p) for k, p in enumerate(pieces))
        out.append(text)
        i = j
    return "".join(out)


def readable(html):
    if not html or not isinstance(html, str):
        return html
    return bold_terms(split_fat(unbold_long(html)))


# ---------------------------------------------------------------- the packs

def fix_item(d):
    s = d.get("system")
    if not isinstance(s, dict):
        return False
    changed = False
    for key in ("description", "unidentifiedDescription"):
        if isinstance(s.get(key), str):
            new = readable(s[key])
            if new != s[key]:
                s[key] = new; changed = True
    for f in s.get("features") or []:   # kits list their features with their own text
        if isinstance(f, dict) and isinstance(f.get("description"), str):
            new = readable(f["description"])
            if new != f["description"]:
                f["description"] = new; changed = True
    return changed


def build():
    n = 0
    for pack in PACKS:
        for f in glob.glob(os.path.join(lib.OUT, pack, "*.json")):
            d = json.load(open(f))
            if fix_item(d):
                json.dump(d, open(f, "w"), ensure_ascii=False, indent=1); n += 1
    for pack in EMBEDDED:
        for f in glob.glob(os.path.join(lib.OUT, pack, "*.json")):
            d = json.load(open(f))
            if any([fix_item(i) for i in d.get("items") or []]):
                json.dump(d, open(f, "w"), ensure_ascii=False, indent=1); n += 1
    return n


if __name__ == "__main__":
    print(build())

"""The rule books' one source (plan step 1, 24 Nov 2026): the wiki repo, whose rules_src/ Markdown is the book of record (K215).

The wiki's own build (build/rules_build.py there) already turns the books into clean data in public/rules/: spells.json,
classes.json, items.json, glossary.json and each book's sections (<BOOK>-text.json). The compendiums are built from that
same data, so Foundry and the online books can't say different things.

Where the wiki is: ARNEYAN_WIKI (a path to a checkout of texet4523-code/arneyan-wiki), else a folder named arneyan-wiki
next to this repository. build/site.lock records the book versions this system was last built from; build.py stops if the
wiki's books are newer or older than the lock without the lock being raised on purpose (python3 build/booksite.py --lock).
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
LOCK = os.path.join(HERE, "site.lock")


def wiki_root():
    for p in (os.environ.get("ARNEYAN_WIKI"), os.path.join(ROOT, "..", "arneyan-wiki")):
        if p and os.path.isdir(os.path.join(p, "public", "rules")):
            return os.path.abspath(p)
    raise SystemExit("Can't find the wiki: set ARNEYAN_WIKI to a checkout of texet4523-code/arneyan-wiki, "
                     "or put one next to this repository as arneyan-wiki.")


def rules(name):
    """One of the wiki's rule files, e.g. rules('spells.json')."""
    with open(os.path.join(wiki_root(), "public", "rules", name), encoding="utf-8") as f:
        return json.load(f)


def path(book, *parts):
    """A file in the wiki's rules_src (the books themselves), e.g. path('HB', 'III_Classes.md'), path('MT')."""
    return os.path.join(wiki_root(), "rules_src", book, *parts)


SITE_URL = "https://arneyan-wiki.pages.dev/"


def _slug(t):
    import re
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", str(t).lower().replace("\u2019", "").replace("'", "")))


def url(kind, name, chapter=None):
    """Where a thing lives in the online books, for the "Read in the rule book" link (plan step 5)."""
    if kind == "spell":
        return SITE_URL + "#/rules/spells/" + _slug(name)
    if kind == "class":
        return SITE_URL + "#/rules/classes/" + _slug(name)
    if kind == "ancestry":
        return SITE_URL + "#/rules/book/HB/character-creation/" + _slug(name)
    if kind == "section":
        return SITE_URL + "#/rules/book/" + chapter + "/" + name
    return SITE_URL + "#/rules"


def versions():
    """The book versions the wiki is at now: {'HB': '0.10.92', 'MT': '0.10.88', 'KK': '0.5.7'}."""
    with open(os.path.join(wiki_root(), "rules_src", "meta.json"), encoding="utf-8") as f:
        return {b["id"]: b["ver"] for b in json.load(f)["books"]}


def check():
    """Stop the build if the wiki's books are not the versions in site.lock."""
    now = versions()
    if not os.path.exists(LOCK):
        raise SystemExit(f"No build/site.lock yet: the wiki's books are {now}. Run python3 build/booksite.py --lock to build from them.")
    with open(LOCK, encoding="utf-8") as f:
        locked = json.load(f)["books"]
    if locked != now:
        raise SystemExit(f"The wiki's books are {now} but site.lock says {locked}. "
                         "If this release ports the new books, run python3 build/booksite.py --lock first.")
    return now


if __name__ == "__main__":
    if "--lock" in sys.argv:
        with open(LOCK, "w", encoding="utf-8") as f:
            json.dump({"books": versions()}, f, indent=1)
            f.write("\n")
        print("site.lock:", versions())
    else:
        print("wiki:", wiki_root(), "books:", versions())

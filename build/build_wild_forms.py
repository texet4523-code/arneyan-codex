"""The Wild Shape list (0.10.43): every beast and beast-like monster in the Bestiary, written into the system so players
can pick a form even when the Bestiary compendium is hidden from them. The beast-like names come from transform.mjs."""
import glob, json, os, re
import lib

HERE = os.path.dirname(os.path.abspath(__file__))
SYS = os.path.join(HERE, "..", "arneyan")


def build():
    src = open(os.path.join(SYS, "module", "transform.mjs")).read()
    m = re.search(r"export const BEAST_LIKE = \[(.*?)\];", src, re.S)
    beast_like = set(re.findall(r'"([^"]+)"', m.group(1)))
    out = []
    for f in glob.glob(os.path.join(lib.OUT, "monsters", "*.json")):
        d = json.load(open(f))
        if d.get("type") != "npc":
            continue
        t = str(d["system"]["details"].get("type", "")).lower()
        if not (t.startswith("beast") or d["name"] in beast_like):
            continue
        out.append({"id": d["_id"], "name": d["name"], "img": d.get("img", ""), "level": d["system"].get("level") or 0,
                    "levelText": d["system"]["details"].get("levelText") or str(d["system"].get("level") or 0), "type": t})
    missing = beast_like - {o["name"] for o in out}
    assert not missing, f"beast-like forms not in the Bestiary: {missing}"
    out.sort(key=lambda o: (o["level"], o["name"]))
    with open(os.path.join(SYS, "module", "wild-forms.mjs"), "w") as fh:
        fh.write("// Built by build/build_wild_forms.py: the Bestiary's beasts and beast-like monsters (Wild Shape's forms).\n")
        fh.write("export const WILD_FORMS = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    return len(out)


if __name__ == "__main__":
    print(build())

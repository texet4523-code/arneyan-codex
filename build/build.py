"""Build every compendium for the Arneyan system from /tmp/hb sources."""
import os, shutil, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
import lib, icons
import build_classes, build_cc, build_spells, build_codex, build_shop, build_actions, build_monsters, build_gear, build_tidy, build_areas, build_auras, build_pregens, build_ancestry_choices, build_activities, build_class_kits, build_class_spells

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
SYS = os.path.join(ROOT, "arneyan")

import books_md
print('handbook sources:', books_md.prepare())

shutil.rmtree(lib.OUT, ignore_errors=True)
os.makedirs(lib.OUT)

build_classes.build(icons.kit_icon)
print('patron and artificer kits:', build_class_kits.build(icons.kit_icon))
build_cc.build(icons.icon)
print('ancestry choices:', build_ancestry_choices.build())
build_spells.build(icons.icon)
_cs = build_class_spells.build(icons.icon)
print('class-only spells:', len(_cs[0]), 'made; already in the compendium:', _cs[1])
print('spell areas:', build_areas.build())
build_codex.build()
build_shop.build(icons.icon)
build_actions.build()
# After the actions: activities go on class and kit features, feats and actions.
print('feature activities (and keys not found):', build_activities.build())

# Approved effects (feats, features, kits, ancestries, spells), before the monsters copy their spells.
import apply_effects
assert apply_effects.run(lib.OUT) == 0, "approved effects point at missing documents"

print('auras (features, spells):', build_auras.before_monsters())
print('monsters:', build_monsters.build())
print('auras (monsters):', build_auras.after_monsters())
print('gear:', build_gear.build(), 'catalogue entries made usable')
print('tidy: removed %d rule items; stray top folders: %s' % build_tidy.build())
print('books v0.10.0:', __import__('books_0100').build())
# books_0100_rules (the v0.10.0 wording of Books I, II and V) is retired: the Handbook v0.10.11 Markdown has all of it,
# and running it on the new text would add a second copy of the Catalogue's light ranges.
print('books v0.10.4:', __import__('books_0104').build())
print('books v0.10.5:', __import__('books_0105').build())
_pg = build_pregens.build()
print('pregens:', _pg['made'], 'made;', len(_pg['missing']), 'not in a compendium:', '; '.join(_pg['missing']))
print('roll tables:', __import__('build_tables').build())
print('readable descriptions:', __import__('build_readable').build(), 'documents')
print('wild shape forms:', __import__('build_wild_forms').build())

# Icons (storage places' default art too)
for glyph in ["locked-chest", "bank", "house", "galleon", "locked-box", "wooden-crate"]:
    icons.icon("place", glyph)
# Coins (Item Piles' currencies)
for coin in ("pp", "gp", "sp", "cp"):
    icons.icon(f"coin-{coin}", "two-coins")
icons.save(os.path.join(ROOT, "icons-used.json"))
subprocess.run(["node", os.path.join(HERE, "make_icons.mjs"), os.path.join(ROOT, "icons-used.json"), os.path.join(SYS, "assets", "icons")], check=True, cwd=ROOT)
subprocess.run(["node", os.path.join(HERE, "make_conditions.mjs")], check=True, cwd=ROOT)

# Class art
from PIL import Image
os.makedirs(os.path.join(SYS, "assets", "classes"), exist_ok=True)
for f in os.listdir("/tmp/hb/art"):
    name, ext = os.path.splitext(f)
    if ext.lower() == ".jpg" and name != "mt_cover":
        im = Image.open(os.path.join("/tmp/hb/art", f)).convert("RGB")
        im.thumbnail((512, 512))
        im.save(os.path.join(SYS, "assets", "classes", name + ".webp"), "WEBP", quality=82)

# Sanity check: every document needs a name, and folder references must exist.
import glob, json
ids = {}
for f in glob.glob(os.path.join(lib.OUT, "*", "*.json")):
    d = json.load(open(f))
    assert d.get("name"), f"no name: {f}"
    ids.setdefault(os.path.basename(os.path.dirname(f)), set()).add(d["_id"])
for f in glob.glob(os.path.join(lib.OUT, "*", "*.json")):
    d = json.load(open(f))
    pack = os.path.basename(os.path.dirname(f))
    assert d.get("folder") in (None, *ids[pack]), f"bad folder ref: {f}"
print("Documents per pack:", lib.STATS)

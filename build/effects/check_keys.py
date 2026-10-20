#!/usr/bin/env python3
"""Check proposed.json against the vocabulary in VOCAB.md.

Usage: python3 check_keys.py [proposed.json]
Exits 1 if any rule key, container, status or trait value is not allowed.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
vocab = open(os.path.join(HERE, "VOCAB.md"), encoding="utf-8").read()

# Every backticked token in the Keys section is an allowed key.
keys_section = vocab.split("## Keys", 1)[1].split("## Containers", 1)[0]
allowed = set(re.findall(r"`([a-z][a-z0-9.]*)`", keys_section))
# Expand the "…" ranges written in VOCAB.md.
ABIL = ["str", "dex", "con", "int", "wis", "cha"]
for prefix in ["check.", "adv.check.", "fail.check."]:
    allowed.update(prefix + a for a in ABIL)
allowed.update(f"slots.{n}" for n in range(1, 10))
allowed.update(f"ability.{a}" for a in ABIL)
# Keys listed under "Applied once when an effect lands" are only valid inside applies.
once_section = keys_section.split("Applied once", 1)[1].split("Multipliers", 1)[0]
APPLIES_ONLY = set(re.findall(r"`([a-z][a-z0-9.]*)`", once_section)) - {"applies"}
# Backticked words in the Keys section that are values or container names, not keys.
allowed -= {"applies", "all", "condition"}

cond_section = vocab.split("## Condition ids", 1)[1]
conditions = set(re.findall(r"[a-z]+", cond_section.split("(")[0]))

CONTAINERS = {"passive", "toggle", "applies"}
WEAPON_SCOPES = {"two-handed", "chosen"}
CONF = {"high", "medium", "low"}
DAMAGE_TYPES = {"acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
                "piercing", "poison", "psychic", "radiant", "slashing", "thunder"}

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "proposed.json")
data = json.load(open(path, encoding="utf-8"))
errors = []


def check_rule(where, rule, in_applies=False):
    k = rule.get("key")
    if k not in allowed:
        errors.append(f"{where}: unknown key {k!r}")
        return
    if k in APPLIES_ONLY and not in_applies:
        errors.append(f"{where}: {k} is only allowed inside applies")
    if "value" not in rule:
        errors.append(f"{where}: rule {k} has no value")
    # A rule for some weapons only: the scopes effects.mjs knows (weaponMatches).
    if rule.get("weapon") and rule["weapon"] not in WEAPON_SCOPES:
        errors.append(f"{where}: rule {k} has an unknown weapon scope {rule['weapon']!r}")
    if k in ("resist", "immune", "vuln"):
        v = str(rule["value"])
        if v.startswith("condition:"):
            if k != "immune" or v.split(":", 1)[1] not in conditions:
                errors.append(f"{where}: {k} bad condition value {v!r}")
            return
        parts = v.split()
        amount_ok = k == "resist" and len(parts) == 2 and parts[1].isdigit()
        if not (parts and parts[0] in DAMAGE_TYPES | {"all"} and (len(parts) == 1 or amount_ok)):
            errors.append(f"{where}: {k} value {v!r} is not a damage type (resist may add an amount)")


for eid, e in data.items():
    c = e.get("container")
    if c not in CONTAINERS:
        errors.append(f"{eid}: bad container {c!r}")
    if e.get("confidence") not in CONF:
        errors.append(f"{eid}: bad confidence {e.get('confidence')!r}")
    for f in ("name", "from", "summary", "manual"):
        if f not in e:
            errors.append(f"{eid}: missing {f}")
    for r in e.get("rules", []):
        check_rule(eid, r)
    # Rules scoped to the picked weapon need a weapon pick, and a pick needs something to read it.
    chosen = any(r.get("weapon") == "chosen" for r in e.get("rules", []))
    if chosen != bool(e.get("weaponChoice")):
        errors.append(f"{eid}: 'chosen' weapon rules and weaponChoice go together")
    if c == "applies":
        if not e.get("applies"):
            errors.append(f"{eid}: applies container with no effects")
        for a in e.get("applies", []):
            w = f"{eid} [{a.get('name')}]"
            if a.get("target") not in ("self", "target"):
                errors.append(f"{w}: bad target {a.get('target')!r}")
            if "rounds" not in a:
                errors.append(f"{w}: no rounds")
            for s in a.get("statuses", []):
                if s not in conditions:
                    errors.append(f"{w}: unknown status {s!r}")
            for r in a.get("rules", []):
                check_rule(w, r, in_applies=True)

used = sorted({r["key"] for e in data.values() for r in e.get("rules", [])}
              | {r["key"] for e in data.values() for a in e.get("applies", []) for r in a["rules"]})
print(f"{len(data)} entries, {len(used)} distinct keys used, {len(errors)} errors")
for err in errors:
    print("  " + err)
sys.exit(1 if errors else 0)

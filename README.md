# The Arneyan Codex for Foundry VTT

The game system for **The Arneyan Codex**, for Foundry VTT v13 and v14.

**Playtest**: released from 0.10.26; the newest version is always under Releases. The rules are complete enough to play, and updates keep coming as the playtest goes on.

## Install

In Foundry's setup screen: **Game Systems > Install System**, paste this into **Manifest URL**, then **Install**:

```
https://github.com/texet4523-code/arneyan-codex/releases/latest/download/system.json
```

New versions then appear under **Game Systems** with an **Update** button. Worlds keep their characters through updates: anything you changed by hand on an item stays (see "What's new" in [arneyan/README.md](arneyan/README.md)).

## What's in it

Character sheets with the new-character steps, classes, Kits, ancestries, feats, skills and spells; the Shopkeeper's Catalogue; the Bestiary; the pregenerated characters; combat, conditions, auras and areas; GM tools for encounters, treasure, travel, time and downtime. The full guide is [arneyan/README.md](arneyan/README.md).

## For maintainers

The compendiums are built from `packs-src/` (`python3 build/build.py`, then `node build/pack.mjs`); the tests are in `test/` (`node test/run.mjs`). Releasing is in [RELEASING.md](RELEASING.md).

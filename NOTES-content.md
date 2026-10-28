# NOTES: branch `content` (Drop 5 and the content gaps)

What's here:

- **Class-only spells as items** (`build/build_class_spells.py`): 34 new spells in the Spells compendium, in
  folders **Necromancer** (23), **Witch** (8) and **Warlock** (3): every spell in the Witch and Necromancer
  "Class-Only Spells" lists, plus Eldritch Blast and the two Warlock Path spells that aren't on the master
  list (Enslave, Slay Living). Same fields as the master list: level, range, save and what a save does,
  damage (scaling with caster level via `spell_damage.py`), area (via `build_areas.py`), costly components.
  Spells already in the compendium are never made twice (the build prints any it skipped: none today).
- **Witch Patrons and Artificer Kits as kits** (`build/build_class_kits.py`): 8 Patrons ("Patron: Mother
  Loretta (Witch)": Patron Buff 1st, Patron Curse 6th, Physical Change 12th) and 4 Artificer Kits ("Alchemist
  (Artificer)": the 1st, 3rd, 7th, 11th features, Lasting Work 15th, Magnum Opus 24th), each kit's Workshop
  list (Known Infusions, Chassis Mods, Gadgets, Formulas) in its description. The kit system grants each
  feature at its level, with uses and saves read from the text ("Once per day" is 1/day).
- **Pregens**: Maud Hollins now has her Patron and her two hexes as real items; Tibbet Quickfuse has his
  Alchemist kit. 3 gaps remain (see section 4).
- **Dice So Nice** (`module/dsn.mjs`), **Item Piles** (`module/itempiles.mjs`), **Token Action HUD**
  (`module/tah.mjs`), registered by `module/integrations.mjs` (one import, one call in arneyan.mjs).
- **Install from a link**: `.github/workflows/release.yml` and `RELEASING.md`. No repository was created and
  nothing was pushed.
- Tests: `node test/content.mjs` (prints "OK content"). All four existing tests pass.

Small hunks in shared files:
- `rolls.mjs`: damage and rider rolls are tagged with their damage type (`tagDamage`).
- `auras.mjs`, `gear.mjs`: an aura's damage roll and a potion's healing roll tagged; a staff's recharge roll shows 3D dice.
- `documents.mjs` (safe-haven rest roll) and `progression.mjs` (rolled HP on level up): the rolls now go on the chat card (`rolls`), so they show 3D dice. They were the only rolls posted to chat without their roll.
- `build.py`: two new build steps and the coin icons; `build_classes.py`: the Witch's "Patrons" heading gets the "each kit is in the Kits compendium" note; `build_areas.py`: Fear (Mass) clears like an instant area; `icons.py`: four coin palettes.

---

## 1. system.json changes

No new packs, styles or document types. Two optional changes:

**For installing from a link** (once the repository exists; replace `<owner>/<repo>`; the release workflow
also stamps these into the released copy):

```json
"url": "https://github.com/<owner>/<repo>",
"manifest": "https://github.com/<owner>/<repo>/releases/latest/download/system.json",
"download": "https://github.com/<owner>/<repo>/releases/download/v0.10.0/arneyan.zip"
```

**Recommended modules** (Foundry lists them when the system is installed; nothing requires them):

```json
"relationships": {
  "recommends": [
    { "id": "dice-so-nice", "type": "module", "reason": "3D dice for every roll, damage dice coloured by type." },
    { "id": "item-piles", "type": "module", "reason": "Loot piles and merchants that use Arneyan coins and gear." },
    { "id": "token-action-hud-core", "type": "module", "reason": "A token HUD with attacks, spells, abilities, saves and conditions." }
  ]
}
```

## 2. README sections to add

### Class-only spells, Patrons and Kits

The spells that only appear in a class entry are in the **Spells** compendium too, each in its class's folder:
the Witch's hexes and class-only spells, the Necromancer's class-only spells, and the Warlock's Eldritch Blast,
Enslave and Slay Living. Drag them onto a sheet like any other spell.

The Witch's **Patrons** and the Artificer's **Kits** are in the **Kits** compendium (Witch and Artificer folders).
Drop one on a character and its features arrive at the right levels: a Patron's Buff at 1st, Curse at 6th and
Physical Change at 12th; a Kit's features at 1st, 3rd, 7th, 11th, 15th and 24th. An Artificer Kit's description
lists its Workshop options (infusions, chassis mods, gadgets or formulas).

### Optional modules

The system works on its own. If these modules are active, it uses them:

- **Dice So Nice**: every roll shows 3D dice, including damage, healing, rest and level-up rolls. Damage dice
  take the colour of their damage type (fire, cold, acid and the rest use Dice So Nice's own looks; slashing,
  piercing, bludgeoning and healing have Arneyan ones). Change the looks in Dice So Nice's Dice Roles settings,
  or switch off "Apply optional dice role appearances" to keep your own dice.
- **Item Piles**: loot piles, vaults and merchants use Arneyan coins (pp, gp, sp, cp) and gear, with quantities
  and Catalogue prices (the first price listed counts, in gold). Gear that changes hands arrives unequipped.
- **Token Action HUD Core**: select a token for a HUD of its attacks, manoeuvres, spells by level (prepared
  ones, with slots left), abilities with uses, saves, attribute checks, skills, conditions, initiative, Luck
  and rest. Click to use, as on the sheet (Shift for Advantage, Ctrl for Disadvantage); right-click an item to
  open it. With several tokens selected it shows saves, checks, conditions and initiative for all of them.
  No separate "Arneyan" HUD module is needed.

### Installing from a link

To install The Arneyan Codex in any Foundry: **Game Systems > Install System**, paste this into
**Manifest URL** and click **Install**:

```
https://github.com/<owner>/<repo>/releases/latest/download/system.json
```

Foundry offers updates from the same link (**Game Systems > Update All**).

## 3. For the book chat

1. **Schools and components** of class-only spells aren't stated in the class entries, so they're blank (the
   Spells browser's school filter won't find them). Only Create Greater Undead states a material (a black onyx,
   100 gp per HD): it's marked M and costly.
2. **Slay Living** (Abyssal Path, 6th): "1d6/level necrotic damage in 30ft radius; creatures of Level 4 or lower
   die instantly (save negates)". No maximum, no save type and no range are stated. Built as 1d6 per caster
   level with no cap, no save set, no range. Does it cap (like Fireball's 10d6), and which save?
3. **Eldritch Blast** is now a cantrip in the Spells compendium (Range 60ft, Reflex half, force, 1d6 to 3d8 by
   Warlock level as the class entry gives), so it rolls like a spell. The class feature stays as the rules
   text. Its description opens "Range 60ft; one creature." to match the spell list's style; the rest is the
   class entry's wording.
4. **Path spells already on the master list** keep their master list level and classes: Burning Hands,
   Scorching Ray, Fireball, Darkness, Faerie Fire, Entangle and others don't list Warlock, and Hypnotism (1st on
   the master list, the Fey Path's 3rd) and Bind Elemental (5th, the Infernal Path's 6th) keep their master
   levels. The book says a Path spell "is always treated as the slot level shown in the table". Should those
   spells list Warlock, and should the Path level be shown?
5. **Cause Fear** is a Necromancer class-only spell and the Abyssal Path's 1st (as "the reverse of Remove
   Fear"): one item, listing both classes. Remove Fear on the master list isn't marked reversible.
6. **Contagion** is in both the Witch's and the Necromancer's class-only lists with the same text: one item
   (in the Witch folder) listing both.
7. **Patron Boon improvements** (Witch 15th: Buff twice a day; 18th: Curse twice a day and DC +1) are class
   features with text only; the kit's Buff and Curse stay at 1/day on the sheet. Raise the uses by hand, or
   say if they should change on their own.
8. **What a save does** is filled in for the class-only spells ("Negates" or "Half", from "Will negates",
   "Fortitude halves"), so "Apply by saves" halves or skips correctly. Master list spells leave it blank as before.
9. **Bone Armour**'s 1d4 (to an attacker who hits you) is its damage button; **Disrupt Undead**'s 1d6 is
   untyped, as written.
10. **Fear (Mass)**: its "1 round per level" is how long creatures are Frightened, so its cone clears like an
    instant one rather than lingering.
11. **Item Piles prices**: the first amount in the Catalogue's price text counts ("6 sp Hand Keg – 56 gp Tun"
    is 6 sp; "1 gp/lb" is 1 gp). Items with no price ("—", Unique) are free to a merchant: the GM sets those.

## 4. Left undone, and why

- **Tibbet Quickfuse's Spark Caster, Fire Bomb and Caustic Flask** are still plain notes on his sheet (with
  the printed numbers). The Spark Caster is a class feature (its damage is on the feature), and Alchemist
  formulas aren't items anywhere: making them items (thrown, Reflex save, a brewed quantity) is a design step
  for the book chat, not something the text defines.
- **Witch Patron improvements at 15th and 18th** aren't automated (see 3.7).
- **Not tested in a live Foundry**: Dice So Nice, Item Piles and Token Action HUD were written against their
  current sources (Dice So Nice's role and colourset API, Item Piles' `addSystemIntegration` checks, Token
  Action HUD Core 2.x) and tested against mocks. Older Dice So Nice versions without dice roles still colour
  by flavour if they match colourset names.
- **Token Action HUD text is English only** (like the rest of the system's UI).
- **Item Piles containers**: a container moved to a pile arrives without its contents (they stay behind,
  loose). Item Piles has no idea of "inside".
- **Releases need `packs-src/` committed** (the book sources the build reads are only on Kieran's computer).
  RELEASING.md says so; `.gitignore` is unchanged.

## 5. How to test in Foundry

**Class-only spells.** Open Compendiums > Spells: folders Necromancer, Warlock, Witch. Drag Horrid Wilting onto
a 15th-level Necromancer, cast it: the card shows Fortitude save, "Roll damage: 15d6", and "Place area: 30ft
radius". Drag Eldritch Blast onto a 9th-level Warlock: damage reads 2d6 force, Reflex save, half on a save.

**Patrons and Kits.** Drop "Patron: Mother Loretta (Witch)" on a 1st-level Witch: Patron Buff appears (1/day).
Level to 6: Patron Curse arrives. Drop "Alchemist (Artificer)" on a 3rd-level Artificer: Brew Formula and
Efficient Brewing. The kit's description lists the Known Formulas.

**Pregens.** (Maud and Tibbet were cut with the Journeymen, 28 Oct 2026; check Patience Ashcombe's kit and spells instead.) Import Maud Hollins from Pregenerated Characters: Kits shows her Patron, Spells shows Hex of
Stumbling and Bind Wound (prepared) as real spells.

**Dice So Nice.** With the module on: roll an attack and a save (3D dice), a fire spell's damage (fire dice),
a longsword's damage (steel-grey slashing dice), a healing potion (green dice), a level up with rolled HP and a
rest in a safe haven (dice for both). In Dice So Nice's settings, Dice Roles lists Slashing, Piercing,
Bludgeoning and Healing under Damage Types.

**Item Piles.** With the module on: drag a dagger from a sheet onto the map: a pile appears; open it, take it
back. Make a token a merchant, give it a longsword: its price reads 15 gp; buy it with a character holding gold
and check their gp goes down by 15. Give a pile some coins in its Item Piles settings and loot them: they land
in the character's currency.

**Token Action HUD.** With Token Action HUD Core (and socketlib) on: select a character token. Attacks lists
the weapons in hand with their bonus; Spells shows prepared spells by level with slots left; click one: the
same card as the sheet. Saves & Checks roll (Shift: Advantage). Conditions: click Prone, the token gets it and
the button lights up. Utility: Roll Initiative, Luck Check, Rest. Select two tokens: saves, checks, conditions
and initiative act on both.

**Release.** After the one-off setup in RELEASING.md, publish a release tagged `v0.10.0`: the Actions tab runs
"Release" and the release gets `arneyan.zip` and `system.json`. Paste the manifest link into a fresh
Foundry's Install System.

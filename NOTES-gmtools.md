# NOTES: gmtools (Drop 3, GM tools)

New files: `arneyan/module/gmtools.mjs` (group rolls, XP, scene controls, registration), `arneyan/module/treasure.mjs`,
`arneyan/module/hazards.mjs` (hazard sheet, trigger cards, environmental clocks), `arneyan/module/data/hazard-models.mjs`,
`arneyan/templates/actor/hazard-sheet.hbs`, `arneyan/templates/apps/environment.hbs`, `arneyan/styles/gmtools.css`,
`build/build_tables.py`, `test/gmtools.mjs`, generated icons `arneyan/assets/icons/hazard-*.svg` and `treasure-*.svg`.

Small hunks in shared files: `arneyan.mjs` (1 import, 1 call), `party.mjs` (2 actions, 1 context line), `party-sheet.hbs`
(2 buttons, XP line), `encounter.mjs` and `encounter.hbs` (saved encounters, No. appearing, treasure), `lang/en.json`
(hazard type name), `build/build.py` (1 line), `test/validate-packs.mjs` (RollTable checks), `icons-used.json` (regenerated).

## 1. system.json changes

Add the stylesheet:

```json
"styles": ["styles/arneyan.css", "styles/gmtools.css"]
```

Add the hazard actor type under `documentTypes.Actor`:

```json
"hazard": { "htmlFields": ["details.description"] }
```

Add the pack (GM only, like the Bestiary) to `packs`:

```json
{
  "name": "tables",
  "label": "Tables of Arneyan",
  "path": "packs/tables",
  "type": "RollTable",
  "system": "arneyan",
  "ownership": { "PLAYER": "NONE", "ASSISTANT": "OWNER" },
  "flags": {}
}
```

and put it in the "Monsters & Treasure" pack folder: `"packs": ["monsters", "tables"]`.

Until the pack is declared, `node test/validate-packs.mjs` fails with "tables: pack not declared in system.json" (the
build makes `packs-src/tables`). With the JSON above all four checks pass (I ran them with it, then reverted system.json).

CONFIG: no arneyan.mjs one-liners needed. `registerGmTools()` (called in init, after `CONFIG.Actor.dataModels` is set)
adds `CONFIG.Actor.dataModels.hazard`, registers `ArneyanHazardSheet` for `hazard`, loads the two templates, and adds
`CONFIG.Actor.trackableAttributes.hazard` on `setup` (arneyan.mjs assigns trackableAttributes after the register calls).
If you prefer them in arneyan.mjs: `CONFIG.Actor.dataModels.hazard = HazardData;` and
`hazard: { bar: ["attributes.hp"], value: ["attributes.ac"] }` in the trackableAttributes object.

## 2. README sections (player-facing text)

### GM tools

**Ask for a roll.** From the party sheet (Ask for a roll) or the Token tools on the left (the d20 button), pick a saving
throw, an attribute check or a skill, and a DC (Easy 10, Moderate 12, Hard 15, Severe 20). Everyone you tick gets a Roll
button on one chat card. Each player rolls their own character; the GM can roll for anyone, or press "roll for the rest"
for absent players. Results fill into the card with a tick or a cross, and Luck burned afterwards updates them. Someone
without the skill rolls it untrained. Tick selected tokens in the window to ask monsters or NPCs too.

**Award XP.** Award XP on the party sheet gives XP to everyone or to the members you tick: the same amount each, or split
between them. XP stops at the character's rate (the XP per level of their class) until they take the level. Anyone with
enough XP shows "Level up" on the party sheet and in the award card. Taking the level with the level-up arrow spends the
XP and sets it back to 0.

**Treasure.** A gem button next to a monster's name (GM only) rolls its Treasure code: individual treasure (P to S) for
each creature, a hoard (A to H) once for the group, and the lair hoard if you tick it. Gems are named from the
Catalogue's stones, art objects from the book's examples, and magic items link to the Catalogue entry. You can turn part of
a hoard's coin into lots of trade goods. "Put it in the party stash" adds the coins to the stash's coins and everything
else as items (a "Weapon +1" stays a placeholder until you pick the weapon). The Encounter Builder's "Roll their treasure"
does the same for every creature in the encounter.

**Encounter Builder.** "Save for later" keeps the encounter in the world's list of saved encounters; click one to load it.
The dice button on a foe rolls its No. appearing as the count (Shift-click for the lair number). The menu by "Place on
the current scene" can roll every group's No. appearing (in the wild or in the lair) as they are placed.

**Tables of Arneyan.** A compendium of roll tables from the books: gems (Lesser, Fine, Superb, and the stones of each
tier), art objects, trade goods, magic items by rarity (with the iconic item tables, linked to the Catalogue), Unique
powers and quirks, the travel Encounter Check, Reaction Checks, a firearm's catastrophic misfire, and the tables in
Confusion, Prismatic Spray, Contact Other Plane, the Wand of Wonder and the Efreeti Bottle.

**Hazards and traps.** Create an Actor of type "Hazard or trap". Its sheet holds how to spot it (a Wisdom check and DC),
how to disarm it (an attribute check or a skill, and DC), what triggers it, what it does (an attack, a save with damage
and a condition), its reset or routine, and its AC, Hardness and HP if someone smashes it. "Ask the party" posts a group
roll to spot or disarm it. "Trigger it" posts a card with the attack, save and damage buttons; the damage card has the
usual Apply and Apply by saves buttons. A complex hazard rolls initiative and shows its routine on its turn.

**Environmental hazards.** The thermometer in the Token tools opens the clocks for holding your breath (and drowning),
extreme heat and extreme cold, for the selected tokens or the whole party. The breath clock moves on with each combat round
(or Next round): it counts down each creature's breath (1 + Constitution modifier minutes, at least 30 seconds), then
the rounds until it falls unconscious at 0 HP, then dying. Rough water adds a Strength check each round. Heat and cold
post each hour's Fortitude save (DC 10, +2 an hour) as a group roll, with Disadvantage for medium or heavy armour in the
heat and Advantage for warm clothing, a fire or shelter in the cold; a button gives those who failed a level of
Exhaustion. Quick cards cover flames, smoke, acid and lava.

## 3. For the book chat

- **XP over the rate.** Codex: "Your XP stops at that rate until you spend it." I cap awards at the rate (any extra is
  lost) and, when a character who had the full rate gains a level, take the rate off (back to 0). Is extra XP lost, or
  does it wait?
- **Trade goods.** "Some hoards hold goods in bulk instead of coin" doesn't say which hoards or how many lots. The roller
  asks the GM for a number of lots (default 0) and takes each lot's value off that hoard's coin.
- **Scroll levels.** "1d3 Spell Scrolls, each of 1st or 2nd level" (and 3rd or 4th, 5th or 6th): I roll which level for
  each scroll (d2). The spell is left to the GM.
- **GM's-choice results** ("Armour +2, or a shield +2", Iconic Rare 18 to 20, Very Rare 12 "or a Unique", "Potion of
  Superior Healing, or an Uncommon potion") go to the stash as the named item or a placeholder with a note.
- **Gem stones and art names.** The book says choose a stone from the tier list (or roll colour and cut). The roller picks
  one of the Catalogue's example stones at random, and art from the book's examples; the stone and art tables in the
  compendium are the same lists. Fine if that's how you'd like them used?
- **Large hoards' coin** goes in as gold ("mostly silver and copper, convert freely").
- **Individual treasure** is rolled for each creature by default (the window asks how many); the book also allows one
  roll for a group that pools its takings.
- **Hazards have no rules text in the books yet.** I built them PF2e style: Level, simple or complex, spot DC (a Wisdom
  check: noticing and searching are Wisdom checks in Book II), disarm DC (default an Intelligence check, from the Rogue's
  "Find/Disable/Set Trap (Intelligence)", or a named NWP), trigger, effect, reset or routine, AC, Hardness (used as
  damage reduction) and HP. Traps default to Reflex saves ("Breath Weapon, Traps" in the save table). A Codex section on
  traps (DCs and damage by Level, who can disarm, Trapwise) would let the defaults follow the book.
- **Suffocation, "then dying if the suffocation continues".** One round after dropping to 0 HP a character goes to -1 HP
  (dying, so the usual bleeding applies). A monster is already dead at 0.
- **Holding your breath** in rounds: minutes × 10, at least 5 rounds (30 seconds).
- **Rough water** "failing by 5 or more means you sink": the card says a total of 7 or less sinks (DC 12).
- **Heat and cold automation:** fire (heat) or cold (cold) Resistance or immunity skips the save automatically; shade, a
  cooling or warming spell and an Insulated garment are a "No save" tick. Double water in heat and "wet clothing counts
  as no protection" are not automated. Exhaustion goes only on characters (monsters have no Exhaustion track).
- **No. appearing ranges** such as "4-36" are rolled flat across the range (1d33 + 3); the book gives a range, not dice.
  "(band 4-24)" is ignored.
- **Reaction Check table** rolls plain 2d6; the leader's Charisma modifier is added by hand.

## 4. Left undone, and why

- The Sorcerer's Corruption table: its entries are not in any source I have (the feature only says the GM rolls on it).
- Hoards A to H are not roll tables: a hoard is several rolls (coin, gems, art, chances of items), which the Treasure tool
  does. The gem, art, trade-goods and magic tables are there for hand rolling.
- Secret group rolls: results show on the public card (the roll cards follow each roller's roll mode).
- Complex hazards don't roll initiative at the start of combat (the monster auto-roll only takes NPCs); "Roll NPCs" in the
  tracker or the hazard's own roll works (d20 + its Initiative field).
- The XP spend on levelling hooks `preUpdateItem`/`updateItem` on class items. If another branch changes how levels are
  taken (a level-up wizard), check the two still agree.
- `icons-used.json` and the new icons are regenerated by the build; on merge, rerun `python3 build/build.py`.

## 5. Test cards (in Foundry)

1. **Group roll.** As GM, open the party sheet, Ask for a roll, choose Reflex save, DC 14, heading "Collapsing floor".
   Card shows every member with Roll. Log in as a player: only their character's button shows; press it, the save card
   posts and the group card fills in (tick or cross). As GM press "roll for the rest". Burn Luck on a player's roll: the
   group card total follows.
2. **Skill roll.** Ask for "Tracking" DC 12: a member with the NWP rolls trained, the rest untrained.
3. **XP.** Award XP, 3 each, to a Rogue at 6/8: the card shows 8 of 8 (capped) and Ready to level up; the party sheet shows
   "Level up". Level up the Rogue on its sheet: XP goes to 0. Try "split" with 7 XP for 3 members: 2 each, 1 left over.
4. **Treasure.** Open the Goblin Boss (code R): the gem button by its name rolls 2d6 gp (a Goblin, code P, rolls 2d6 sp each). Open an Adult Red Dragon (lair G), roll with
   the lair ticked: coin, Superb gems, Major art, a Rare item (linked). Press "Put it in the party stash": coins land in
   the stash's coins, gems stack (5 a slot), art and items appear in the stash; the button greys out.
5. **Encounter Builder.** Add goblins (No. 2d6, lair 40-400) and press the dice: the count changes (Shift: the lair number). Set "Roll No. appearing (in the wild)"
   and Place: tokens match the rolled numbers. "Save for later", Clear, then load it from Saved encounters. "Roll their
   treasure" posts one card for all of them.
6. **Tables.** Compendium "Tables of Arneyan" > Magic Items > Rare Magic Items: Roll until 5 to 10 comes up: it draws on
   Iconic Rare Items and links the Catalogue item.
7. **Hazard.** Create Actor "Dart Trap", type Hazard or trap. Spot DC 15, Disarm DC 15, trigger and effect text, attack
   Dart +6 1d4 piercing, save Reflex 14 2d6 fire half, condition Prone. "Ask the party" (spot) posts a Wisdom check
   group card. Target a token and press "Trigger it": attack, save and damage buttons; roll damage and use Apply by saves.
   Tick Complex, give it Initiative 2, add its token to a combat: on its turn the routine card is whispered to the GM.
8. **Breath.** Select two tokens, open Environmental hazards (Token tools, thermometer), start "Under water". Next round
   counts down; at 0 breath a card says who runs out of breath; then 0 HP; then dying. With a combat running, advancing
   the round moves the clock. Tick Rough water: each round posts a Strength check DC 12 card (heavy armour Disadvantage).
9. **Heat.** Start Extreme heat for the party, Next hour twice: Fortitude DC 10 then DC 12 group cards; a member in chain
   mail has Disadvantage; press "Those who failed gain 1 level of Exhaustion".
10. **Quick cards.** "Standing in flames": a Reflex DC 12 button, a 1d6 fire damage button and the Burning condition link.

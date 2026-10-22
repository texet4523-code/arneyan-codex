# NOTES: branch `world` (Drop 4: time, companions and travel)

New files: `arneyan/module/world.mjs` (registers the rest and feeds the sheets), `worldtime.mjs`, `summons.mjs`,
`companions.mjs`, `downtime.mjs`, `travel.mjs`; templates `templates/actor/companions.hbs`, `downtime-tab.hbs`,
`travel-tab.hbs`; `styles/world.css`; `test/world.mjs` (prints `OK world`).

Shared files touched (small hunks): `arneyan.mjs` (one import, one `registerWorld()` call), `sheets.mjs` (import,
`...WORLD_SHEET_ACTIONS`, a Downtime tab for characters, `Object.assign(context, worldSheetContext(actor))`, the
effects list shows world-time left, a drop on the Companions box), `party.mjs` (import, `...WORLD_PARTY_ACTIONS`,
a Travel tab, `Object.assign(context, await worldPartyContext(...))`), `actor-sheet.hbs` (two partial includes),
`party-sheet.hbs` (one partial include). No data model changes: everything new is kept in flags.

Storage, for the record:
- Effects: `flags.arneyan.endsAt` (world seconds) on any effect made with a duration.
- Summoner: `flags.arneyan.summon` (the active summon), `flags.arneyan.pactSlain`. Summoned actors: `flags.arneyan.summoned`,
  folder "Summoned". Combatants: `flags.arneyan.summonedBy`.
- Companion actors: ordinary `npc` actors with `flags.arneyan.companion = { master, preset, kind, chassis }`, in
  "Allies, Mounts & Pets". No new actor type was needed.
- Characters: `flags.arneyan.downtime` (the log), `flags.arneyan.hunger` (days without food and water).
- Party: `flags.arneyan.travel`. Items: `flags.arneyan.meals` (an open Week's Rations pack), `flags.arneyan.empty` (water containers).

## 1. system.json changes

Add the stylesheet (nothing else: no new packs, document types or socket changes):

```json
"styles": [
  "styles/arneyan.css",
  "styles/world.css"
]
```

## 2. README sections to add

### Game time

Effects now run on the game clock as well as in combat. A spell or ability effect with a duration (rounds, minutes,
hours or days) ends when that much game time has passed, in or out of combat; while its own combat is running, the
combat's rounds end it as before. Numbered conditions (Stunned 2) also count down with game time outside combat.
Concentration ends when the spell's own duration runs out. Lit torches and lanterns already burn down with game time.

A small clock above the player list shows the game date and time. The GM's buttons move it on 10 minutes, 1 hour,
8 hours (a night's rest; use Rest on the party sheet for its benefits) or 1 day. A world setting hides the clock from
players.

### Summoning

Cast a summoning spell (Summon Monster, Summon Animals, Summon Elemental and the rest) and its chat card gets a
**Summon creatures** button. Pick the creatures from the Bestiary within the spell's limits (Levels, how many, the
kind of creature); they appear beside the caster, belong to the caster's player, and join the caster's combat acting
straight after the caster. They leave when the spell's duration ends (rounds in combat, game time outside it), when
concentration ends (Summon Swarm), when they drop to 0 HP, or when dismissed from the caster's sheet. You can have
only one spell-made attacker at a time: summoning again, or casting Spiritual Weapon, Animate Objects, Mordenkainen's
Sword and the like, sends the last one away.

A Warlock's **Pact Summons** card has a **Call your patron's servant** button: choose the tier (each spends a slot of
its tier, a 5th-level slot for Tier 4) and combat (1 minute) or ritual (1 hour). The servant comes from your Path's
Shared Summons; Tier 1 servants arrive with double HP and damage dice. A slain servant can't be called again until
a long rest.

### Familiars, companions and mounts

The **Companions** box on a character's sheet holds familiars, animal companions, mounts and pets. Press + and pick
what it is (the sheet offers what your class, kit and spells give you) and which creature, or drop any creature from
the Bestiary on the box. Each one gets its own small sheet in Allies, Mounts & Pets, owned by the same player, with
its stats from the class text, and they follow your level:

- Witch, Familiar: 1 HP per two Witch levels (minimum 1), AC 14.
- Wizard, Summon Familiar: half your maximum HP.
- Ranger (Beast Master), Bonded Companion: Hit Dice equal to half your Ranger level, rounded up.
- Paladin, Divine Mount and Knight, Birthright Mount: a light warhorse (or a war pony for a small Paladin).
- Artificer (Construct Engineer), Construct Companion: built to its chassis (Guardian, Scout or Striker).
- Any mount or pet: its Bestiary stat block.

The box shows each one's portrait, HP and AC, with buttons to put it on the map beside you (or find it there) and to
let it go. An active summon shows there too, with its time left and a Dismiss button.

### Downtime

Characters have a **Downtime** tab: a log of what they did between adventures. **New activity** offers the Codex's
downtime activities: Earn Income, Craft, Brew a Potion, Make a Magic Item, Copy a Spell, Scribe a Scroll, Research a
Spell, Learn a Skill, Train, Treat a Disease, Side Quest, and anything else the GM rules on. Each one works out the
days and the gold, takes the coins (tick "Paid already" if you've paid), rolls the check where the Codex gives one,
pays out income or returns half the gold on a failed craft, and adds a line to the log. Results can be edited
afterwards.

### Travel

The party sheet has a **Travel** tab. Set the distance in hexes, how the party travels (on foot, mounted or by ship,
or an Umbral Journey), the pace, and whether the terrain is difficult (one pace slower): it shows hexes a day, days to
go and the rations needed against what the members and the stash carry. Each day the GM presses **Travel one day**:
game time moves on a day, everyone eats a day's rations (a Week's Rations pack holds seven) and drinks a day's water
(a canteen or waterskin holds a day's water until refilled; tick "Water along the way" when there are streams and
wells), and the Encounter Check is rolled (d12: 11 a Hard Encounter, 12 a Dangerous one), drawing from the
encounter roll table named on the tab (or one called Travel Encounters, Random Encounters or the like). Going without
food past 3 + Constitution modifier days, or without water, brings Exhaustion.

## 3. For the book chat

1. **Hex size.** The Codex gives travel speed in hexes a day but no hex size, so the Travel tab takes distance in hexes. A hex size (miles) would let it take miles.
2. **Difficult terrain at Slow pace.** "Drops the party one pace step, so Normal becomes Slow": the text doesn't say what happens to a party already at Slow. Built: it stays Slow (1 hex a day on foot).
3. **How much water a canteen holds.** The Codex says each character drinks "a day's water" a day but no item says how much that is. Built: any canteen, waterskin or bladder holds one day's water and must be refilled ("Refill water", or "Water along the way" refills every day).
4. **Spell durations live only in the description text.** Every spell's `duration` field is blank. Time limits for summons are taken from a table in `summons.mjs` checked against the text; for spell effects with no rounds of their own and for concentration, the duration is read from the description only when it states exactly one ("1 round per level"). 24 spells state several (a reversed form, a rider) and get no automatic end. Filling the spells' Duration field in the book source would fix this properly.
5. **Pact Summons slot level.** "Expends a slot of the creature's tier": built as exactly that level (not "that level or higher" as for spells).
6. **Tier 1 doubling vs the Bestiary.** The Imp in the Bestiary has HD 1d8, 4 HP, Bite 1d4 and Sting 1; the Warlock table shows "HD 4d8 ... Bite +3 (2d4) and Sting +3 (2d4 + poison)". Built: the Bestiary block with HP and damage dice doubled (8 HP, Bite 2d4, Sting 1). The two should be made to agree.
7. **"A slain summon cannot be called again until you finish a long rest."** Built per caster, not per creature: after the servant is slain, Pact Summons is locked until that Warlock's next long rest (Rest on the sheet or the party's Rest).
8. **Summon Lesser Monster / Greater Monster limits.** "No spellcasting, summoning or at-will magic" and "non-unique" aren't in the Bestiary data, so the picker can't filter on them: the GM checks. Summon Planar Ally's "extraplanar" is taken as fiends, celestials and elementals; Summon Animals' "natural animals" as beasts that aren't swarms.
9. **Bonded Companion HP.** "HD equal to half your Ranger level (rounded up)": built as the animal's own Hit Die size (d8 if it lists none), HP the average of those dice, the way the Bestiary works out HP. The animal's Level, attack and saves stay as the Bestiary has them.
10. **Divine Mount "with maximum HP".** Settled by the books v0.10.0: the light warhorse is 2d10+4 (15 HP) and the warpony 2d8+2 (11 HP), so a Divine Mount gets 24 and 18.
11. **Construct Companion levels.** "d8 Hit Dice equal to your level": built as the Artificer level (the same feature counts damage in Artificer levels). HP is the average of those dice.
12. **Earn Income without a skill.** "Roll d20 + a relevant skill modifier": a character with no fitting skill rolls a plain d20 (as an untrained crafter does).
13. **Treat a Disease.** Rolled once a day for up to the days chosen, stopping at the first success; the days logged are the days it took.
14. **Side Quests.** The two-at-a-time limit isn't enforced (the log has no "active" state); the GM keeps to it.
15. **Exhaustion from hunger and thirst** is added automatically each travel day. Foraging (Slow pace) and getting lost are left to the GM; the card reminds them at Slow pace. Forced marches (hours beyond 8) aren't modelled: a travel day is a normal day.

## 4. Left undone, and why

- **Placeholder attackers.** Spiritual Weapon, Animate Objects, the Bigby's hands and the like end the previous summon when cast, but nothing is placed for them (they have no Bestiary entry). They still need a token or template from the GM.
- **Summoned creatures obeying commands, "defends itself only", "attacks the nearest creature if you are Incapacitated"**: shown on the card, not automated.
- **Witch familiar delivering a Hex or touch spell** is in the companion's description, not automated.
- **Mount speed for travel** isn't used: choose "Mounts, vehicles or ships" on the Travel tab.
- **Long rest on the clock's +8 h**: the button only moves time on; the Rest buttons give the benefits (so a GM can move time without resting).
- **Downtime doesn't move the clock** (several characters spend the same week in parallel); the GM moves the clock.
- I couldn't run a live Foundry here: everything was checked against the mock harness, the pack data and the v13 API types. Worth a click-through (below), especially the summon placement and the Travel tab's form saving flags.

## 5. How to test in Foundry

**Game time**
1. As GM, see the clock above the player list. Click +10 min: the time changes.
2. Put a condition with a number on a token out of combat (Stunned 2 from the token HUD). Click +10 min: it's gone, with a GM whisper.
3. Cast a spell with an applied effect that has rounds (or give an effect a duration in its settings: 1 hour). On the Effects tab it shows "1 h left". Click +1 h: it's removed.
4. Cast Summon Swarm (concentration, 1 round per level): the concentration effect shows its time left; +10 min ends it.
5. Light a torch, click +1 h: it burns out (unchanged behaviour).

**Summoning**
1. A Wizard 9 with Summon Monster, token on the scene, in a combat with initiative rolled. Cast it: the card has "Summon creatures".
2. Pick "1d3 creatures of Level 3 or lower", a Wolf, Summon. Wolves appear around the Wizard, owned by the player, listed in the tracker just below the Wizard.
3. Roll initiative for all NPCs: the wolves stay just below the Wizard.
4. Advance 9 rounds: they leave with a chat line. Or drop one to 0 HP: it vanishes.
5. Summon again, then cast Spiritual Weapon: the summon leaves ("another spell-made attacker").
6. Druid 7 with Summon Animals: pick two Level 4 beasts: refused ("Their Levels add up to 8; your limit is 7"). Four wolves (Level ½ each) are fine.
7. Warlock 7 (Asmodeus kit) uses Pact Summons > Combat Summons: "Call your patron's servant", Tier 1 Imp: a 1st-level slot is spent, the Imp has double HP. Kill it: Pact Summons is locked until the Warlock rests.
8. As a player (GM online), do step 2: the GM's client places them.

**Companions**
1. Witch 5 with the Familiar feature: on the sheet, Companions +, "Familiar (Witch)", Raven, Add. A Raven appears in Allies, Mounts & Pets with 2 HP and AC 14, owned by the same player.
2. Level the Witch to 7: the familiar's max HP becomes 3.
3. On the Companions box press the map pin: the Raven's token appears beside the Witch. Press it again: the map pans to it.
4. Open the Raven: its sheet says "Familiar (Witch) of ...".
5. Drag a Light Warhorse from the Bestiary onto the Companions box: choose "A mount or pet" and add it.
6. Press × on a companion: it and its tokens go.

**Downtime**
1. A character with Weaponsmithing (Trained) and 100 gp: Downtime tab, New activity, Craft, value 100, Hard: 50 gp are taken, the skill roll card posts, the log shows 4 days, 50 gp and the result. On a failure 25 gp come back.
2. Earn Income: 6 days, coins added by the tier rolled.
3. Make a Magic Item, 3000 gp, Rare: 1,500 gp and 42 days, a Severe (DC 20) casting-stat check, and a warning if the character can't cast 5th-level spells.
4. Edit a result with the pen; delete an entry with the bin.

**Travel**
1. Party sheet, Travel tab: distance 9, on foot, Normal: 2 hexes a day, 5 days to go. Tick difficult terrain: 1 hex a day, 9 days.
2. Give one member 2 Day's Rations and a canteen, another nothing, and put a Week's Rations in the stash. Untick "Water along the way".
3. Travel one day: the clock moves on a day; the first member eats a Day's Rations and drinks from the canteen, the second eats from the stash pack (6 meals left) and goes without water (Exhaustion 1). A GM-only card shows the d12.
4. Make a roll table called "Travel Encounters" (or type a table name on the tab): on an 11 or 12 it is drawn to the GM. Name a table whose formula is 1d12 and it is drawn every day instead.
5. Refill water; New journey resets the count.

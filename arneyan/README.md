# The Arneyan Codex for Foundry VTT

Version 0.10.68 · Foundry v13 and v14 · **Playtest release**

## What's new in 0.10.68

- **Fog of war in travel mode** (Kieran, 27 Oct). On a hex map with travel mode on, the party token sees 2 hexes around it in full colour by its own light (1 hex at night), instead of its best member's darkvision (grey, and far too wide on a map of hexes). With the scene's fog exploration on, places the party has passed stay on the map, dimmed, and the rest stays hidden from players. The scene's **Global Illumination** has to be off for this (Configure Scene, Lighting), or the whole map counts as lit. The members' other senses (Truesight, Blindsight, Tremorsense) don't reach across the map in travel mode, and it works whether or not **Token vision follows senses** is on. Out of travel mode, and on battle maps, vision is as before, unlinked party tokens included.
- **Battle Space** (books v0.10.24, Kieran's call B9): from 3rd level a Fighter counts as flanking a creature whenever an ally is also in melee with it, not only when directly opposite.

## What's new in 0.10.67

**Weak monsters are free only up to the party's number** (Kieran, 27 Oct, R8). In the Encounter Builder and the combat tracker's budget, creatures 6 or more Levels below the party still cost nothing, but only one per character; any more cost ¼ each (a solo ¼ × party) and count for the crowd rule. Thirty kobolds against four 8th-level characters now cost 12, beyond Deadly, where before they cost nothing. Free places go to solos first, so the order you add foes in doesn't change the total. A foe's row says how many of it are free and how many pay, for example "free × 4, ¼ × 26 (far below)".

## What's new in 0.10.66

**Elemental Mastery asks once** (Kieran, 27 Oct). The element picked on Elemental Mastery gives Resistance from 8th and immunity from 20th, so Elemental Mastery (Improved) no longer asks a question of its own. A character who got the Improved feature in 0.10.65 and hasn't answered it yet loses the question with this update; pick the element on Elemental Mastery if it's still blank. If you changed Elemental Mastery's element list by hand, your version stays, so mark its immunity at 20th yourself.

## What's new in 0.10.65

**Every class has its core features by 5th level** (books v0.10.23, B7; Kieran, 27 Oct): you feel like your whole class early, and later levels improve what you have.

- **Class features at their new levels:** about 90 features across the 22 classes change level, nearly all of them earlier, several as a core version with an improved one later (Battle Space at 3rd improving at 13th and 17th; Legend of Battle at 6th, a minute long from 20th; Banish at 5th; Divine Monolith at 9th; Everstrike at 5th; Perfect Loose at 3rd; Counterspell at 5th; Wild Shape Casting at 6th; and so on). New: **Rage Styles** (Barbarian 2nd), **Hunter's Tricks** (Ranger 2nd), **Hit and Run** (Rogue 2nd, Swashbuckler 4th, Assassin 5th) and **Dirty Fighting** (Rogue 9th).
- **Their automation follows:** Smite Evil twice a day from 5th, Divine Intervention from 5th, Aura of Courage from 2nd, Aura of Devotion from 9th, Divine Monolith's aura (10ft from 9th, 20ft and every creature from 22nd), Iron Mind from 8th, Sixth Sense from 8th, Survival Instincts from 9th, Wild Surge from 2nd, Force of Nature from 6th, Evasive Manoeuvre +2 AC (+4 from 20th), Dead Aim +1d6 (+2d6 from 13th), Elemental Mastery Resistance (immunity from 20th), Arcane Cascade +2 AC from 9th, Signature Spells one from 9th and two from 18th. Unbroken and Master Duelist track one use a day; from 24th, when they're once per encounter, reset the use after each encounter. The Artificer's +1 Intelligence and the Ranger's and Rogue's +1 Dexterity are their own features now, and the Warlock's +1 Charisma comes with Pact Summons (Tier 4) at 15th.
- **Kits:** Artificer tiers at 1st, 3rd, 5th, 7th and 10th; Witch Curse at 3rd and Physical Change at 7th; Warlock Patron's Mark at 4th and Patron Feature at 8th; Sorcerer Bloodline Awakening at 10th; Holfast's Triple Strike from 17th.
- **Characters already made:** the update gives their classes and kits the new levels and adds the features they've newly reached (a 6th-level Fighter gets Manoeuvre Mastery, Battle Space, Unbroken and Legend of Battle; a 5th-level Witch her Patron Curse). A feature you deleted earlier stays deleted, homebrew entries on a class stay, and nothing is taken away. The GM's report lists what was added, and the two features the books dropped (Battle Space (Improved), now part of Battle Space, and the Artificer's 11th-level Kit Feature) for you to delete by hand. Features on sheets keep their compendium links, so their rules and uses update as usual. Classes in the Items directory get the new levels too.
- **Fixes:** a reminder for extra damage in dice reads as its dice (Blessed Weapon "+1d6 vs evil creatures" and Steady Shot's dice, not "+0"); an Imp's Allegiance says it's Lawful Evil as a devil, not "fiend". The Codex has the Fighter's Manoeuvre Mastery at 2nd and 9th.

## What's new in 0.10.64

**Cosmic alignment** (books v0.10.19 and v0.10.20, Book II "Alignment in Arneyan"; Kieran, 26 Oct). Mortals aren't truly good or evil; gods, fiends, celestials and the undead are.

- **Outlook and tenets:** the Biography tab's Alignment box is now **Outlook** (how your character behaves, for roleplay), with a **Tenets** box beside it for one or two in your own words. The GM's **+ Luck** button on the sheet is now for acting on a tenet at real cost (once a session).
- **Allegiance:** your true side in the gods' war, shown under Outlook with where it comes from. Most mortals are **Unaligned**. Clerics, Paladins and Battle Priests hold their god's alignment while favoured, and Warlocks their patron's (a fiend pact makes you Evil). Profane acts pull a mortal towards Evil; the GM judges when they've made someone Evil and types it in the **GM sets** box (blank works it out again).
- **Creatures:** devils are Lawful Evil, demons Chaotic Evil, other fiends Neutral Evil, celestials Good and undead Evil by nature; everything else is Unaligned unless the GM sets one on its Biography tab.
- **Divine Favour** for Clerics, Paladins and Battle Priests (GM sets it on the Biography tab): **Strained** cards for Turn Undead and your highest-level spells carry a DC 12 check button (Wisdom, or Charisma for Paladins); on a failure the use or slot is spent. **Forsaken** stops every class ability your god grants until you atone: a Paladin's class abilities, Divine Mount included; a Cleric's or Battle Priest's spells, Turn Undead and divine features (Extra Attack, Wisdom Bonus and Weapon Selection stay); the deity Kit and its powers. A Cleric/Paladin multiclass serving one god counts both.
- **Spells and features that name an alignment** go by Allegiance: with tokens targeted, a reminder like "+1d6 vs evil creatures" says which targets count, and cards for Holy Word, Protection from Alignment, Dispel Alignment and the like list each target's Allegiance. Unaligned mortals never count.
- **Gods and patrons:** every deity Kit carries its god's alignment from the World of Arneyan wiki and links the god's page for their tenets (also on the character's Biography tab); patron Kits link their pages too. Archdevils and demon lords hold their kind's alignment; Bolothamogg and the Queen of Air and Darkness are Chaotic Evil, Tiandra Chaotic Good and Verenestra Chaotic Neutral (Kieran, 27 Oct). A Kit's alignment can be changed on its sheet. Kits already on characters get the alignment and the wiki link with the update.
- **Books v0.10.20:** Atonement moves a god's servant one step towards Favoured, and for anyone else ends an Evil Allegiance from profane acts; the Character Creation journal, Assassin, Bard (Change Alignment now shifts Outlook), Cleric, Paladin and Necromancer follow the books' new wording.

## What's new in 0.10.63

**The Map Browser** (Kieran, 26 Oct): your battle maps as thumbnails, for the GM. Open it from the **Map Browser** button at the top of the Scenes sidebar.

- **Search** by name, creator, type or version ("night", "gridless"), and filter by type or creator. Sort by type, by creator or A to Z.
- **Packs are maps:** each pack folder (for example "Abandoned Mine Entrance [33x21] - $1 Rewards") is one card, with its day, night, gridless and animated versions in a list.
- **Types** (Caves & Mines, Taverns & Inns, Wilderness and so on) are guessed from each map's name. Click the pencil on a card to change them; your choice is kept.
- **New scene** makes a scene from the chosen version, sized to the picture, with the grid worked out from the "[33x21]" in the name, hidden from players until you show it. The picture button puts the map on the scene you're looking at instead.
- **Thumbnails** are made the first time a map scrolls into view and saved in `Data/arneyan-maps`, so the next visit is instant. **Rescan** picks up new maps.

**Setting it up once.** Foundry can only show files inside its Data folder, so link your maps folder into it. On Linux, in a terminal:

```
ln -s "$HOME/Desktop/TTRPG/Foundry/Battle maps" "$HOME/.local/share/FoundryVTT/Data/maps"
```

- If Foundry's data lives somewhere else, **Setup, Configuration** shows the User Data Path: use that path's `Data` folder in place of the second one.
- If a `maps` folder is already in Data, rename it first, or link to another name (`.../Data/battle-maps`) and pick that folder with **Folder** in the browser.

The browser shows `maps` by default; **Folder** in the browser (or the "Map folder" game setting) picks another folder inside Data. Nothing is copied: the maps stay where they are. The first open scans the folder (big collections take a minute, with the count showing as it goes); after that it opens straight away, and **Rescan** looks again.

## What's new in 0.10.62

**Max HP shows its bonuses** (Kieran, 25 Oct).

- In Edit mode, the **Max** box under Hit Points is your maximum before bonuses. It now says what's added on top, for example "Max [6] + 1 Toughness", so a total of 7 no longer looks off by one. Monsters show their bonuses as one total. Anything that halves or doubles HP (Debilitated, Animal Growth) adds "then halved" or "then doubled".
- The Codex journal follows books v0.10.18: the inventory bullets bold only their labels.

## What's new in 0.10.61

**Strength sets 16 to 22 inventory slots** (Kieran, 25 Oct). Rules journals follow books v0.10.16.

- **Capacity:** 16 slots at Strength 6 or less, 18 at 7 to 12, 20 at 13 to 15 and 22 at 16 or more. Over-the-limit penalties are unchanged.
- Every character's limit updates by itself, including characters already in a world.
- Nine pregens gain 2 slots: Brakka, Brenna, Gauthak, Sir Durgan and Big Wen (Strength 18), and Hulda Frostbraid, Ilyra, Marta and Rook (Strength 13 or 14). Everyone else is unchanged, and all 19 start inside their limit.
- The Codex, Character Creation and Catalogue journals now print the new steps. Character Creation and the Catalogue also print the books' bundling list: knives, darts, aclis, javelins, harpoons, bolas and scrolls 5 a slot; daggers, hand/throwing axes, spears and tridents take their listed slots. Foundry already counted them this way, so no item changes. The 0.10.60 stopgap for the Knife and scroll rows now has nothing left to change.

## What's new in 0.10.60

**Knives and scrolls bundle 5 a slot** (Kieran, 25 Oct).

- **Knives** (throwing knives) are thinner and lighter than a Dagger, so up to five share a slot. Daggers and Hand/Throwing Axes can still be thrown but take 1 slot each, whatever a pregen's older note says.
- **Scrolls** stack like potions: a stack of blank scrolls, or of the same written scroll, takes 1 slot per 5. Each different written scroll is still its own item.
- The Book V Catalogue journal shows both ("1 (bundles 5/slot)") until the books catch up.
- Knives and blank scrolls from the compendium that are already in a world change once; a slot value the GM set by hand stays.
- **Pip Thistlewick** carries two Knives (1d2+4) instead of two daggers, so she starts at 17 of 18 slots rather than at her limit.
- Tansy, Wren and Sir Durgan count their pair of daggers or axes at 2 slots now, and all three stay inside their limits. Pregens already in a world keep their old weapons and slots: drag a fresh copy from the compendium.

## What's new in 0.10.59

A fix from the last play test on TAC (25 Oct): **ten pregens started over their inventory limit**, with Disadvantage on attacks and up to 30ft off their Speed. Their sheets' "Chalk, 12 sticks" counted 12 slots instead of the printed 1. Wherever a printed sheet gives a slot total, the gear now takes it (12 sticks of chalk in 1 slot, four Fire Bombs in 1), the Level 1 Keepers carry their two flasks of lamp oil, and all 19 start inside their limit. The Backpack still takes no slot, as Kieran ruled on 25 Oct. A pregen already in a world keeps its old slots: drag a fresh copy from the compendium.

## What's new in 0.10.58

**The playtest version.** The compendiums follow the books **v0.10.13** (Players Handbook and Monsters & Treasure), and the **Pregenerated Characters** are back.

- **Book I:** the Codex's Healing says current HP can never exceed max HP (Foundry has worked this way since 0.10.52), and Energy drain is reworded (it inflicts Exhaustion, never past level 5).
- **Pregenerated Characters** return in the Adventures folder: the 15 Broken Anvil characters and the four Jacob's Well Keepers. HP matches every printed sheet. Five small differences from before stay, as agreed: AC for Brakka, Brenna, Gauthak, Liriel and Maud (Armour Master, Shield Expert and Liriel's Agile Defence are reminders, the Ring of Protection isn't automated, and Maud's 15 assumes Mage Armour), and Brenna's Reflex by 1.

## What's new in 0.10.57

Two fixes from re-running the play tests T128 to T132 on TAC (25 Oct):
- **Travel mode counts on the party itself**, even when its token isn't linked (a party made from the sidebar had an unlinked token, so the count went on the token's own copy and the party sheet showed nothing). New parties' tokens are now linked, as characters' are. (The Party on TAC was already linked.)
- **Unidentified gear gives nothing away to players:** no price, charges or recharge button on their sheet's Gear tab, in a storage place or in the party stash; storage lists it as plain Gear; an unidentified wand, staff or scroll stays off their Wands, Staffs & Scrolls list; the storage ledger and "gives ... to" chat lines use its plain name; and a player who uses one (a wand, a potion) posts only that they try it, for the GM to say what happens (an unknown scroll still takes its reading check). An unlinked party token's sheet opens the party's own. Its name and slots still show, and the GM sees everything as before.

## What's new in 0.10.56

**The compendiums now follow the books v0.10.11** (Players Handbook and Monsters & Treasure), read from the book chat's own Markdown sources.

- **Monsters:** save DCs as the books regenerated them; every spellcasting monster has its printed **spell DC** (26 gain one, 34 have theirs corrected); Combat Reflexes on the eight creatures that have it; the Archmage's dagger +14; the Remorhaz a Level 11 solo with 125 HP.
- **Spells:** harmful Touch spells use a touch attack instead of a save, as the books now print (Chill Touch, Shocking Grasp, Bestow Curse, Polymorph on an unwilling creature, the Cure and Cause spells against undead, and the Necromancer's and Witch's Touch of Fatigue, Inflict Light Wounds, Ghoul Touch, Contagion and Harm). Updated wording for Animal Friendship, Hold Animal, Charm Person or Mammal, Healing Circle and others.
- **Classes and kits:** the books' latest wording, including Assassin and Rogue hiding (Hidden while lightly obscured even on 12 to 14), Wild Shape's list of beast-like monsters, Woodcraft's trap search, Pact Summons' Shared Summons stats and the Necromancer's and Witch's class-only spells with school and components.
- **Rules journals:** Book I's Disengage & Hide (hiding tiers and Search DCs), Surprise Rounds, Combat Manoeuvres, Inventory (the Backpack takes no slot), Non-Lethal Damage, Travelling Rules, Ranged Attacks and Traps; Book II's Quick Roll option and Backpack line; Book IV's Spell Targeting and touch attacks. Journal pages keep their ids, so links to them still work.
- **Hide and Search actions** use the hiding tiers and Search DCs on their cards too.
- **Catalogue:** two-handed weapons say so in their traits; spell components keep "(by quality)" in their price.

- **Pregenerated Characters held back** until the final playtest version (Kieran); pregens already imported into a world stay.

Characters' own copies of items keep their wording; their rules, saves and uses follow the update as usual. Drag an item in again from the compendium for the new text.

## What's new in 0.10.55

- **Action bar toggle fixed.** The Token HUD button that shows or hides the Token Action HUD bar, and the bar starting hidden, now work when Token Action HUD's own show/hide key has no binding (as on TAC). Before, both stopped with an error and the bar stayed on.

## What's new in 0.10.54

Batch 8 (Kieran, 25 Oct).

**Automatic effects**
- **Choose-one features:** **Elemental Mastery** asks for its element and makes you immune to it (fire, cold, lightning; earth, water and air as a reminder). **Eldritch Invocations** asks for one at 1st and another at 5th, 9th, 13th and 17th (asked when you level up); Devil's Sight gives the sense, the others show on the right cards. While there's a pick to make, the feature shows **Choose** on the sheet; once picked, the list icon beside it changes the picks.
- **Expanded Mind** adds a spell slot of your highest level, and it moves up as you level.
- **Shifter:** your lineage becomes a **Shifted** switch with The Beast Within's uses (half your level a day, rounded up). Its benefit counts only while it's on: Swiftstride +15ft speed, Beasthide Resistance 3 to non-magical weapons; the others as reminders. Shifters made before this update get the switch too.
- **Turn Undead:** a Turned creature stops being Turned when the one who turned it attacks it.
- Already working, now noted as such: Genasi and Tiefling resistance from the caste or bloodline you pick, Iron Body and Iron Mind save bonuses, the Hedge Knights' and Boldock Wall-Knights' own Embolden and Demoralise, Aura of Devotion.

**Feature buttons** checked against the Handbook (v0.10.10): Assassin's Traps (1 minute to disable; failing by 5 or a natural 1 sets it off), Slow Kill (bleeding stacks; a Cripple Limb save), Holy Campaign (once a year), Necromancer Command Undead (1 + half your level a day, its own uses), Magus Levelled Spellstrike 3rd-4th from 7th level, Pact Summons (Tier 4 takes a 5th-level slot; one summon at a time), Arrow Repertoire's daily arrows.

**Firearm reloads.** Guns and heavy crossbows keep track of what's loaded (the Repeating Pistol holds 5, the Wind Rifle 6, Paired Pistols 2). Each shot uses one; an empty weapon asks you to reload. Reloading takes the weapon's listed rounds of your action: in a fight, this turn's action and as many more as it needs, and it's ready to fire on the turn after (you can still move); out of a fight, at once. A misfire empties it: clear it, then reload. Quick Reload, and a Gunslinger's Lightning Reload, make it part of the attack or a round faster. The weapon's row shows what's loaded, with a reload button.

**Secret group rolls.** Ask for a roll has a **Secret** box: the players roll blind, their card shows only who has rolled, and you see the results.

## What's new in 0.10.53

- **The action bar is off by default** (Kieran, 25 Oct). The Token Action HUD bar (Attacks, Abilities, Saves & Checks...) no longer pops up on its own: right-click a token and use the new grid button among its buttons to show or hide it. Each player's choice is their own. (Only with the Token Action HUD module installed.)
- **The donated sets journal fills itself from chat.** The set a player doesn't keep is posted in chat and copied into the Donated Ability Score Sets journal by the GM's client, at once or the next time a GM comes on. Sets posted by earlier versions ("can be donated to the table") are picked up when the world loads. A set taken from the journal doesn't come back.

## What's new in 0.10.52

Batch 7: player feedback (23 Oct). 0.10.51 (batch 6, below) wasn't released on its own, so it comes with this one.

- **Lighter starting packs** (Kieran, 25 Oct): torches bundle 5 a slot, and the Backpack takes no slot, since it provides the grid itself. The Explorer's Pack is now 8 slots and the Dungeoneer's 11. The starting gear window shows each pack's slots and says when one would put you over your limit. Torches and Backpacks already on sheets change once when the world loads (a slot value you set yourself stays).
- **Starting Luck isn't rolled for you.** The last new-character step asks: type in what you rolled at the table (the default), roll it here, or leave it for later. Starting gold has a box to type your table roll into as well.
- **Donated sets** (Rule B): the Method V set you don't keep goes into the **Donated Ability Score Sets** journal (Kieran, 25 Oct: one line per set, six scores and who gave it). Anyone making a character can take one under **Type in a set** (Use fills in the scores; the set comes off the list when you set your scores). The GM can edit the journal by hand (add or change lines; delete a line, or strike it through, to take it off), but nobody can delete the journal. The set not kept is posted in chat and the GM's client copies it into the journal automatically, there and then or the next time a GM comes on; older chat lines from before this ("can be donated to the table") are picked up too. Taking a set goes through the GM.
- **A Craft skill means a crafting Skill.** The Dwarf's Knack lists only the crafting Skills (those with an Artisan's toolkit: Alchemy, Armourer, Blacksmithing and the rest); the Automaton's adds Engineering. The Aasimar's still lists the Wisdom and Charisma skills.
- **Current HP never above max** (Kieran, 25 Oct). Typing or healing current HP past the maximum stops at the maximum, and when the maximum drops (Debilitated, a drain, a level or feature lost), current HP comes down with it and stays there when the maximum comes back.
- **Green buttons** in every Arneyan window (Kieran, 25 Oct: green, not grey): the main one has a gold ring, and one that can't be pressed yet (Set the scores before the scores are assigned) is greyed with a dashed edge.
- **Right-click a condition** on the sheet to take it off, as in the effects panel.
- **Gold in the Browser.** When the Browser adds to a character, it shows their coins and inventory slots, and keeps them up to date as they buy.
- **Resting ignores armour** (Kieran, 25 Oct): characters are assumed to take it off for the night, so a rest no longer refuses its benefits to someone with medium or heavy armour still marked as worn. The GM rules otherwise when it matters.
- **Passive awareness and hiding** (books v0.10.10, K2; Builder requests B-F2 and B-F3):
  - **Aware** on every character and monster sheet (and the party sheet): 10 + Wisdom modifier, +5 with Advantage on noticing (Master in Perception, or a feature such as a deity's Granted Power), −5 with Disadvantage (Poisoned and the like); they cancel. Situational sources (watch duty, smell, low light) are listed in its tooltip. Click it to **Search**: a Wisdom check (Perception for a monster that has it) against a targeted hidden creature's Search DC; on a success its card offers to end the hiding.
  - **Hide** box on the sheet: a Dexterity (Stealth) check. Press the card's **Set how hidden** (after any Luck) and the creature gets its tier as a condition: **Partially Hidden** (12-14, Search DC 12), **Hidden** (15-19, DC 15) or **Completely Hidden** (20+, DC 20), with where it holds and which senses it beats. The GM gets a private card of who on the scene notices (passive awareness against the DC) and whose special senses still find it. Rogues and Assassins are told they count as Hidden while lightly obscured on 12-14, and their own Hide (from the class feature) does the same as the box, with its notes (Disadvantage above half speed, Skill Mastery). Stealth features show as reminders on the roll. Attacking or casting a spell ends hiding.
  - **Surprise check** (GM, the eye in the token tools): mark the ambushers and the unaware; each unaware creature's passive awareness, with its surprise bonuses (Combat Sense, Survival Instincts, Sixth Sense; Advantage from Perceptive Grit), less an Assassin's Surprise, against the lowest Search DC among the hiding ambushers; an ambusher who isn't hidden gives the group away, so nobody is surprised (books v0.10.11). If nobody hid: Moderate 12 for a quiet approach, Hard 15 for a prepared ambush. "Cannot be surprised" features are flagged. **Mark the surprised** gives them **Surprised** (no moving, actions or reactions); run the surprise round as round 1 and it comes off when round 2 begins.
- **Camp watch and surprise** (books v0.10.10-11): the night Encounter Check's card shows the watch's passive awareness against the comers' Search DC (or use the Surprise check, or rule from the camp's precautions), and its button asks the watch to **Search** (an active Wisdom check) instead of a plain Perception roll.
- **Who can move the party token.** A **Players** button on the party sheet (GM) shows which players can select and move the party token and why not (a player set lower than the Default, a locked or hidden token, the game paused), with a button to let every player move it.

## What's new in 0.10.51

Batch 6 (Kieran, 22 Oct): travel food, foraging and camp mode. Every roll is a button someone presses; only eating is automatic.

**Travel**
- **Hours, not hexes.** In travel mode the party token shows the hours travelled today with the journey's day in brackets, "4 h (Day 3)" (each hex is its share of the 8-hour travelling day), and so does the Travel tab.
- **Food every day.** At dawn after each day of travel, every member eats one Day's Rations (their own first, then the party stash; a Week's Rations pack counts as seven) and drinks a day's water. The meal is eaten when the party sets off, so food foraged that evening counts. A card says who ate. At 0 food, after the Codex's grace of 3 + Constitution modifier days (minimum 1), each day without brings a level of Exhaustion. This replaces the 7-day ration card; a Week's Rations from the shop is the seven-day bundle.
- **Foraging.** At Slow pace the day's card has a **Forage** button (and the Camp tab has one too): Survival, DC 12 (untrained: a plain d20), once per character per day (dawn to dawn). The roll card's **Collect** button (press it after any Luck you burn) puts 1d4 Day's Rations, plus one for every 5 over the DC, into the character's pack.

**Camp tab** (on the party sheet)
- **Watches** from 22:00 to 06:00, split by how many stand them (1 or 2: 4 hours each; 3: 2 h 40 m; 4: 2 hours; 5: four 2-hour watches, one of them a pair). The watch now is marked.
- **Next watch / Previous watch** (GM) move the game clock between watches (from daytime, on to 22:00; after the last, to 06:00).
- **Night Encounter Check** (GM, secret, once a night): a d12, 11 a Hard Encounter, 12 a Deadly one. If something comes, a die picks the watch it comes in, and a button asks that watch for **Perception** (a Wisdom check, not a skill): each watcher rolls their own, and the result decides surprise.
- **Activities**, each with a Roll button: Keep watch (Perception), Forage (Survival, DC 12), Hunt (Hunting or Survival, DC 12, needs a ranged weapon or traps: 1d6 Day's Rations, +1 per 5 over), Cook (Cooking), Tend wounds (First Aid/Healing), Repair gear (your craft), Scout the camp (Wisdom, once a night), Make camp (Fire-building). Cook's and Scout's bonuses are the GM's call.
- **Who does what:** a watch and an activity for each member, from drop-downs. The watches, the night check and the Roll buttons follow it (a Roll button rolls for the member on that job); with nobody assigned the watches go in order and each button asks who.

## What's new in 0.10.50

- **The Remorhaz is off the Wild Shape list** (books v0.10.8 make it a Level 11 solo, and Wild Shape is never a solo). The Young Remorhaz stays. Its new stat block arrives with the next Bestiary rebuild.

## What's new in 0.10.49

Two book decisions of 22 October (the Coordination Board), ahead of the next Handbook build:
- **Wild Shape is never a solo monster** (M3): the Roc and the Purple Worm are off the beast-like list, and any solo is refused.
- **Ranger trap search** (F3): Advantage when actively searching for wilderness traps, as well as the Ranger table's search bonus (+2 at 1st up to +6 at 24th).

## What's new in 0.10.48

**Class features follow your level** (Kieran: "wild shape's ability doesn't improve when the PC levels up, make sure all abilities like that change based on level"). Numbers that step up in the class Progression Tables now change on the sheet and on the cards when a character levels up, instead of staying at their 1st-level value. Characters already in the world get this with the usual update when the world loads (uses left are kept, up to the new maximum).

- **Uses a day (or week):** Wild Shape (1 a day, 2 from 3rd, 3 from 6th, 4 from 9th, 5 from 15th, 6 from 24th), Grit (2 from 10th, 3 from 20th), Exalt (once a day per Bard level), Exhort Greatness (twice from 15th), Divine Intervention (1 a week from 13th, 2 from 17th, 3 from 22nd).
- **Monk:** AC from the Monk table with no Dexterity while wearing no armour or shield (13 at 1st up to 19 at 21st); Fast Movement (35ft up to 60ft; over the inventory limit it's 30ft with the usual penalty); Unarmed Strike dice from the table (1d4 up to 1d10), with the better of Strength and Dexterity; Hand-to-Hand Combat's **Unarmed attacks** button rolls the action's attacks (1, then 2 from 6th and 3 from 16th), each a full Unarmed Strike attack whose damage uses that column's dice (Primary, Secondary, Tertiary) with every damage bonus, critical hits and the subdual choice; Iron Body and Iron Mind save bonuses (Iron Mind from 9th); Deflect Missiles a round; Slow Fall distance.
- **Rogue and Assassin:** Sneak Attack dice (Rogue 1d6 to 4d6, Assassin 1d6 to 7d6), with a damage button; Back Attack multiplier (x2 to x6); the Assassin's Surprise penalty.
- **Ranger:** Survival Instincts surprise bonus (+2 to +6), trap search bonus and trap damage.
- **Bard, Barbarian, Paladin:** Exalt bonus (+2 to +5), Fascinate targets (2, 4, 10), Exhort Greatness creatures, Whirlwind Attack opponents (2 to 5), Cure Disease a week, Aura of Courage range, Animate Dead's free uses a day.
- **Fated Survivor:** Luck is added for you: +1 Starting and Current Luck when the feat is taken (after the Starting Luck roll at 1st level), then +1 at each of 5th, 10th, 15th and 20th reached after that (to 20 at most). Levels removed, or the feat, take off what it added. The Codex doesn't say whether a feat taken late (say at 15th) also gets the steps already passed: the cautious reading is used (it doesn't); say if you want it the other way. A character who already had the feat gets only the steps reached from now on, so Luck you added by hand isn't added twice.
- **Tanatharen Grove:** Voice of the Grove's extra Wild Shape a day is now added for you (rule `uses.extra.wild-shape`), on top of the scaling uses.
- For homebrew: a rule's value or an activity's text can carry a level table, as a whole value of numbers or dice ("1:13, 2:14, 4:15") or in braces inside text ("add {1:1d6, 13:2d6}"), read at the feature's class level; a reminder whose table starts at a higher level appears from that level.

## What's new in 0.10.47

- **Random art.** A monster's sheet has a dice button (GM only): it gives the monster another picture of itself from your art packs (the ones picked under Monster art in the system's settings), found beside the art it has: files named after it ("goblin-2") or a close name ("goblin-warrior", "goblin_archer_bow"), never another monster's ("goblin-boss"). On a placed monster it changes that token only, so a band of goblins can each look different; on a monster in the Actors sidebar, the token it places.
- **Numbered duplicates.** When a scene has two or more of the same monster, their tokens are named Goblin (1), Goblin (2) and so on, in the order they were placed (the first one becomes Goblin (1) when the second arrives). A token you rename yourself is left alone. Turn it off with **Number duplicate monsters** in the system's settings.

## What's new in 0.10.46

- **Changing shape changes the token itself** (Kieran: "I want the original actor to turn into that thing literally, and can be reverted back"). Polymorph, Wild Shape, Change Shape and the rest no longer hide the creature's token and put a second one beside it: its own token becomes the form where it stands (the form's art, size, sight and sheet; the same place in the combat tracker) and turns back on return, wherever the form went. A monster's unlinked token gets its own HP and changes back too. The form uses the GM's art packs where the Bestiary has art for it.
- **The creature's own sheet** shows a banner while it's out in a form: **Open the form** and **Return to own form**.
- The form's actor can't be deleted from the sidebar while the creature is out in it (that would strand its token): return to its own form instead.
- Gathering and deploying the party finds a member who is out in a form.
- A creature changed on an earlier version (its token hidden and locked) still returns the old way.

## What's new in 0.10.45

Monsters & Treasure v0.10.5 (the books of 22 October): **every monster has attribute scores.**
- **Scores.** All 464 stat blocks (and the two animated objects) have Strength to Charisma, so a monster's attribute checks, initiative and contests use real modifiers. The "–" for monsters without scores is gone.
- **Saves** are worked out as the book now does: the attribute modifier + half the Level (minimum 1), Constitution for Fortitude, Dexterity for Reflex and Wisdom for Will (Level ¼ and ½ count as 1, Mythic as 30).
- **Skills.** 265 monsters have the book's Skills line, shown under their saves and rolled from there: a listed skill adds the modifier (at least +1), a Master one also rolls with Advantage (a star marks it). Spellcraft, Ancient History, First Aid/Healing, Religion, Survival and Tumbling are the Handbook's Skills (NWP); Perception, Stealth, Insight and the like are named attribute checks.
- **Contests** (Grapple, Trip and the rest): a monster rolls d20 + its attribute modifier, as a character does. The old "save minus half its HD" is gone, from the Codex journal too.
- **The book's other stat-block changes** come with it: the riders that now say how long they last, the Giant Shark's bite (2d8+4) and the other beasts the book retuned, senses printed in the blocks, and the animated objects, now Monsters & Treasure's own (same names, so Animate Objects still summons them).
- **Animal Friendship** checks the target's Intelligence (1 or 2, as the spell says).
- **Spell DCs.** A monster whose stat block gives no spell DC works it out as a caster does, 10 + half its Level + its best Intelligence, Wisdom or Charisma modifier. With real scores that modifier now counts, so 26 innate casters' DCs rise (most by 1 or 2; a Deva or Djinni by 4, the Solar by 9). Set a DC on the sheet (edit mode) to override it.
- **Monsters already in your world** (all six scores still 10) take their scores when the update runs, plus the new saves where theirs are still the old book's (each save you changed stays) and their skills if they have none. Companions and mounts kept from the Bestiary are included. The GM's update card lists them. Their attacks and abilities aren't changed: **Update from the Bestiary** on a monster's sheet brings the whole new stat block.
- **Importing an NPC** with scores and no saves works its saves out the same way, and an NPC's import block can list skills.

From the Player's Handbook v0.10.6, which settles what Foundry asked:
- **4d6, drop the lowest** is now the Handbook's optional Quick Roll, and Rule C applies to it: a set without two scores of 14 or higher can't be kept, and the window offers **Roll again**.
- **Travel encounters:** an Encounter Check of 11 is a **Hard** Encounter and 12 a **Deadly** one (the Handbook's words now), with the 7-day rations as before.

## What's new in 0.10.44

Fixes from the first night's play:
- **Travel mode and the clock.** Each hex the party token moves takes its share of an 8-hour travelling day (on foot at Normal pace, 2 hexes: 4 hours each; an Umbral Journey's 24: 20 minutes each). When the day's hexes are done (or **End the day here**), the party camps and the clock goes on to the next morning (dawn, as set in the calendar's Daylight panel). Undoing a move (Ctrl+Z) winds the clock back by those hexes' time.
- **The players roll the Encounter Check.** The end-of-day card has **Roll the Encounter Check (d12)** for anyone to press, once per day; on an 11 or 12 the GM gets **Draw from the encounter table**. Nothing is rolled automatically in travel mode any more. The 7-day ration card stays as it was.
- **Daylight per scene.** Each scene's settings (Environment tab) have **Follow the time of day**: tick it and that scene darkens at night and brightens by day with the game clock; untick it and the scene gets its own darkness back. It's off until ticked, so a scene the old all-scenes daylight darkened gets its own darkness back after the update: tick it again if it should follow. The calendar's Daylight panel keeps the times (dawn, full day, dusk, full night) and how dark the night and day are, and saves them as you change them.
- **Wild Shape window** in the sheet's colours (no more grey boxes; forms above your cap are greyed and locked). **Its spells** can't be ticked before 15th level (Wild Shape Casting, and then only spells with no somatic component).

## What's new in 0.10.43

- **Wild Shape picks the beast.** A druid's **Wild Shape** (its **Use** button) opens a list of every beast and beast-like monster in the Bestiary (a wolf, a giant spider, an owlbear and so on), with search. Those above your cap (half your Druid level, at least 1; your full Druid level from Deepened Shape at 12th) are shown locked with the level they open at. Pick one and you become it, as Change Shape does: a use is spent, the form lasts up to an hour (a **Wild Shape** effect on the form; when it ends you return to your own form) and at 0 HP you return as before. From 12th level the form also gets twice your Druid level in temporary HP; from 15th, your spells come along (Wild Shape Casting). The form's sheet has a button to return to your own form (and using Wild Shape on the form does the same, if its features came along). Players see the list even when the Bestiary is hidden from them; the GM's side checks the pick is within the cap.
- **Change Shape: every creature.** The Change Shape window (the paw on a sheet) has **Every creature in the Bestiary** for the GM: the whole Bestiary at any Level, with search and a type filter, for Polymorph, Shapechange and the like.
- **Players are asked for initiative.** When a player's character (or their companion) joins a fight without an initiative, or the fight starts, a small window pops up with **Roll initiative**. The GM's bell in the combat tracker asks everyone still waiting again.
- **Easier to read.** Descriptions of features, feats, kits, spells, actions and gear are laid out in short points instead of long paragraphs, and key terms are bold (dice, DCs, distances, durations, uses per day, Advantage and Disadvantage, saves, HP and conditions). The words are the books'. Copies already on sheets (and kits' features) take the new layout when the update runs, unless their words were changed; a monster's own abilities, made in the world rather than taken from a compendium, keep theirs.
- **Spells for one kind of creature.** Hold Animal, Animal Friendship and Calm Animals only work on animals (beasts); Charm Person, Hold Person, Dominate Person, Enslave and Daze on humanoids (a player character counts as one); Charm Monster and Hold Monster not on undead (Charm Monster not on constructs either); Bind Elemental on elementals; the undead spells on undead; Cause Fear and Scare up to their Level (Scare not on undead or constructs). The spells' save, effect and damage buttons leave the others out and say who and why (a monster's ability with the same name isn't limited).
- **Obscuring Mist** is now placed where the caster stands (it doesn't move with them) and has **Remove area**. Spells that move with the caster (Spirit Guardians, Invisibility Sphere and the like) have **Remove area** on their card too.
- **Chat card buttons** fit their words (a long label wraps inside the button).
- **Touch spells roll to hit** (Kieran's ruling): a touch spell against an enemy is an attack, d20 + BtH + your casting modifier against its AC, in place of the save; on a hit it takes full effect, on a miss none. An ally is touched automatically. The spell's card has **Touch attack**; damage and effects are on the attack's card, for the one it hit. Cure Light, Serious and Critical Wounds heal an ally with no save or roll; against an undead (radiant damage) or cast reversed (necrotic) they're a touch attack. Reversible spells (Heal, Remove Curse and the like) attack only when cast reversed.
- **No spells or features above your level.** A player can't add a spell above the highest level they have slots for, or a class feature above their level in that class (or from a class they don't have). The GM can add anything; levelling up and kits add theirs as before.
- **Fold spell levels.** Click a spell level's name (or its arrow) to fold its spells away; the sheet remembers it in your browser.
- **No more jumping.** Opening a spell (or anything) on a sheet no longer scrolls the sheet up.
- **Changing shape:** the creature's own token, hidden while it's a form, is locked: move the form instead, and the creature comes back where the form stands. (From 0.10.46 the token itself turns into the form.)
- **Undo** on an area spell's damage undoes everyone it hit: Apply by saves makes one card for those who failed and one for those who saved (and the GM's for monsters), and Undo on any of them now puts them all back.
- **Animate Objects summons** its objects: **Animated Object** and **Animated Object, Large** (20 HP, AC 14, speed 30ft, a slam that hits automatically for 1d8 or 2d8), made from the spell's own numbers. Up to one per two caster levels; a Large one counts as two.
- **Monsters without ability scores** (Monsters & Treasure gives none yet) show "–" instead of 10 and +0. Their saves are the book's.

Beast-like monsters on the list (the GM's call, as the feature says; intelligent or magical ones left out): Owlbear, Death Dog, Hippogriff, Griffon, Ankheg, Bulette, Carrion Crawler, Grick, Grick Alpha, Hook Horror, Young Remorhaz, Hydra, Piercer and Rust Monster. Never a solo monster (so not the Roc, the Purple Worm or the Remorhaz).

## What's new in 0.10.42

- **Click a row to read it.** On a character's or monster's sheet, click the name of anything (gear, weapons, armour, containers, skills, feats, features, spells, ancestry, kit) and it opens underneath: its key numbers (damage, range, AC, charges, slots, price, school and so on) and its description, with **Show in chat** and **Open**. Click again to close it. Right-click any row to open the item in its own window. The party stash and storage places work the same way. A skill rolls from its bonus button; a potion or torch is used with its **Use** or **Light** button.
- **4d6, drop the lowest.** The ability scores window has a third choice: roll 4d6 six times, dropping the lowest die each time, then put each score on an attribute. One roll per character, as with Method V, and the Gygaxian Threshold (Method V's rule) doesn't apply to it.

## What's new in 0.10.41

Fixes from testing 0.10.40 live:
- **Travel mode counted every move twice** (a one-hex move took two hexes off the day). Each move now counts once.
- **Double-click the clock's grip** puts it back above the player list again (it didn't in 0.10.40).
- **Daylight with two GMs:** a second GM's view now follows the time of day too, as well as the scene the players are on.

## What's new in 0.10.40

- **Show and hide the clock.** In the scene controls on the left, the **Journal Notes** tools have a clock switch, **Show or hide the game clock**, and a **Calendar** button that opens the calendar. Each person's choice is their own.
- **Move the clock and the calendar.** Drag the small clock by its grip (the dotted handle on its left) to anywhere on the screen; it stays there, and a double-click on the grip puts it back. The calendar window opens where you last left it.
- **Travel mode.** On the party's **Travel** tab, tick **Travel mode** and move the party token on the map: each hex counts towards the day's hexes at the party's pace (on foot Slow 1, Normal 2, Fast 3; mounted, by vehicle or by ship 2, 3, 4; an Umbral Journey 24). The hours travelled today show over the token as it moves, with the journey's day in brackets ("4 h (Day 3)"), and on the tab. When the day's hexes are used the day ends: a card in the chat, the Encounter Check (to the GM) and a day of game time. Stop short with **End the day here**, which ends the day all the same. At dawn after each day, every member eats a Day's Rations (their own, then the party stash) and drinks; days without food beyond 3 + Constitution modifier bring Exhaustion, one level a day. Moves on a square grid (a battle or town map), from a token's settings or a paste don't count; undoing a move gives today's hexes back. With travel mode off, **Travel one day** works as before, eating a day's rations each day.

## What's new in 0.10.39

- **The clock runs in real time.** Press the play button on the game clock (or **Run** in the calendar) and game time passes a second a second, until you stop it; it holds while the game is paused and, unless you untick it, while a combat runs (combat counts its own rounds). The calendar shows the seconds ticking; the small clock keeps to hours and minutes. Effects, light and rests count the time as it runs. The calendar can run it faster (2×, 6×, 10×, a minute a second).
- **Move the time freely.** The calendar (GM) has steps back and on (a minute, 10 minutes, an hour, a day), Dawn, Midday, Dusk and Midnight for this day, and **Set time** to type a time of day. Moving on, time passes; winding back moves the clock without undoing anything that was counting.
- **Daylight on the scene.** In the calendar, **Daylight on the scene**: tick **Scenes follow the time of day** and the scene the players are on (and the one you are viewing) darkens and brightens with the time, fully dark at night, a gradual dawn up to full day and a gradual dusk down to full night. Set when dawn, full day, dusk and full night come, and how dark the night and the day are, then **Save daylight**. Untick a scene (indoors, underground) and it gets its own darkness back; a scene whose darkness is locked in its settings is left alone, and turning daylight off puts every scene's own darkness back.

The books v0.10.4 (21 October), mirrored:
- **Dragonborn:** the draconic type (fire, cold, lightning, poison or acid), chosen at creation, sets both the breath weapon and Resistance 5, as the ancestry now says.
- **Traps:** a Traps page in the Rules (Book I, after Environmental Hazards). A Hazard's sheet has a **Deadly** tick and **Use the Traps table**, which fills in the Find and Disarm DC, the Save DC and the damage for its Level. A trap in a fight counts towards the encounter like a creature of its Level.
- **Class-only spells:** the Witch's, Necromancer's and Warlock's own spells show their school and components; the three with a costed component (Animate Dead (Greater), Create Greater Undead, Symbol of Death) say what it is.
- **Knight kits:** Steadfast Courage (Hedge Knights, 3rd level) and Wall-Forged Dread (Boldock Wall-Knights, 5th) are written out in full and work as the usual Embolden and Demoralise do: once a day, with their own effect to apply. Each takes the place of the class's own on the sheet, which comes back if the kit goes. A character who already has the kit gets the new version by removing the kit and adding it again.
- **Importing:** importing again onto a sheet, or a second character in the same session, no longer stops part-way; an NPC's attack its base monster already has (the Ogre's Greatclub) takes the block's numbers instead of coming twice.
- **Monster art:** stand-ins for the last monsters no pack has art for by name (a geist for the Apparition, a fossil golem for the Bone Golem, bison for the Ox, and so on). Press **Scan** again to pick them up. Only the Moth is left without.

## What's new in 0.10.38

- **Choose which art comes first.** Game Settings, **Monster art** has a new list, **1c. Which art comes first**, of the modules and folders you scan. Move one up with the arrows and its art is used for every monster it has art for, even where a lower one's file name fits more closely; the ones below fill the gaps. Press **Scan** after changing it. Each line shows how many monsters it gave art to.
- Monster art knows the newer names some art packs use: the Ogre Mage as an oni, the Thug as a tough, the Tribal Warrior as warrior infantry, the Veteran as a warrior veteran, the Yuan-ti Pureblood as an infiltrator, the Quipper as a piranha, and so on. Press **Scan** again to pick them up.

## What's new in 0.10.37

- Monster art reads a few more close names: a weapon in the name ("grimlock handaxe") or "demon" or "devil" put first ("demon mezzoloth"), still never another Bestiary monster's art. Press **Scan** again to pick them up.

## What's new in 0.10.36

- **Monster art finds more.** Press **Scan** again in Game Settings, **Monster art** to pick these up (the old index used the old names).
  - Word order and wording don't matter: "Red Dragon, Adult" finds "adult red dragon.png", "dragon-red-adult.webp" and "Red Dragon (Adult).webp"; "Spectre" finds "specter"; "mage with owl.png" is a mage and "veteran in plate armor.png" a veteran; "HillGiant.webp" is a hill giant.
  - Monsters a token pack calls something else are found by that name too: the Aboleth by its newer name (alghollthu master), the four elementals as living whirlwind, landslide, wildfire and waterfall, devils by their older names (barbazu, osyluth, gelugon and so on), the Vampire as vampire count, a Wyrmling as the pack's young dragon, a Light Horse as a riding horse. Where a pack has nothing by the name, a close kin stands in (a grizzly for a Brown Bear, a gorilla for an Ape).
  - A close name counts when the extra words are a role, age, colour or gear ("kobold scout", "goblin warrior", "chimera red"), never another creature or another Bestiary monster (a vampire squid is no Vampire, a goblin dog or a goblin boss no Goblin).
  - A folder named after the monster counts too, for packs that keep each creature in its own folder ("Thug/..."), though not for a file in it that is another monster ("Wolf/dire-wolf.png" is the Dire Wolf's).
  - The window lists the monsters still without art.

## What's new in 0.10.35

- The Monster art window scrolls as a whole (its last lines were cut off), with the module list a fixed height inside it. It no longer pre-ticks token tools (Token Action HUD, Token Magic FX, token rings and the like) as art packs; ticks you saved with a scan stay as you left them.

## What's new in 0.10.34

- **Monster art from folders too.** Game Settings, **Monster art** now also reads folders of images in your Foundry Data, not just art modules: a token pack you downloaded as plain images. Unzip it into Data (for example `art/monster-tokens`), add the folder (type it, or **Pick a folder**), then **Scan**. Images named after a monster ("adult blue dragon.png", "goblin.png") are matched to the Bestiary; others are left alone. Nothing is copied, so leave the folder where it is.

## What's new in 0.10.33

- The calendar's Kanka window is wider and its buttons are shorter (Pull, Send date, Forget pulled, Save), so their text no longer overlaps.

## What's new in 0.10.32

- **Weak monsters cost nothing.** As in Monsters & Treasure (Building Encounters): a creature 6 or more Levels below the party costs nothing and is never part of a crowd (Level ½ counts as −1, ¼ and 0 as −3). Three goblins against a 12th-level character cost 0. The Encounter Builder shows them as "free (far below)".
- **The calendar and Kanka.** The calendar's **Kanka** button (GM) keeps it in step with the calendar on your Kanka wiki:
  - **Pull** brings in the calendar's events as they are on the wiki (festivals, dated events, birthdays on other entries) in place of the ones the calendar came with, and offers to set this calendar to Kanka's date (the date only: no time passes). Anything admin-only on Kanka, and events on private entries, are hidden from players: they stay in your browser and never reach theirs. **Forget pulled** goes back to the built-in list. (An entry hidden from players only through Kanka's role permissions, rather than marked private, can't be seen as hidden from here: mark it private on Kanka, or the reminder admin-only.)
  - **Send date** moves Kanka's date to this one; or tick **Kanka follows this date** and it follows by itself a few seconds after the date moves here.
  - Kanka's date moves a day at a time (up to 20 at once, Kanka's limit is 30 requests a minute); for a bigger jump it says how far off Kanka is, to set there by hand. Nothing else on Kanka changes, and nothing is deleted.
  - It needs a Kanka token: make one on Kanka (Profile > API, it lasts a year) and paste it into the Kanka window. It stays in your browser only; players never get it.

## What's new in 0.10.31

- **The Arneyan calendar**, in place of Simple Calendar (switch that module off). It's the Tobiasian Calendar from the Kanka wiki: twelve months of 30 days named for the Tarielian gods (Lathos to Ilmatria), a seven-day week (Moonday to Suneday) that starts again with each month, and years AC.
  - Open it from the calendar icon on the game clock. Each day shows Elnaris's full moon, new moon and quarters (on the same days as Kanka), the festivals (the Sowing Feast, the First Harvest, the Night of Masks, Highharvestide, the Feast of the Moon and the rest), the seasons, and the wiki's dated events (the Shattering, the Planar Eclipses of 499, 506 and 513).
  - The Dark Moon: from the date it first rose (Game Settings, "The Dark Moon first rose", 1 Lathos 504 to start with), the calendar shows its six-month cycle, Opening, Watching and Receding, and which cycle it's on. Days of a Watching month are shaded. The GM's calendar shows more about it than the players' does.
  - The GM can **Set date** and **Add note** on any day, once or every year, shown to players or hidden from their calendar. Players see the calendar and the notes meant for them. (Hidden notes are kept in the world's settings, which a player who knows how could still read: keep real secrets in a GM journal.)
  - **Set date** only moves the date unless **Time passes** is ticked: setting the campaign's date the first time ends nothing and burns out no torches. Ticked, game time moves on to it, as with the clock's buttons.
  - The game clock, the downtime log and storage ledgers show the date this way ("Tyrsday, 11 Ilmatria 503 AC, 14:05").
  - A world already in play: set today's date once with **Set date**.

## What's new in 0.10.30

- **Import a character or NPC from a chat.** Ask a chat for a character or NPC "in the Arneyan import format" (the project doc *Arneyan Import Format* describes it: one JSON block). Then, as the GM, either press **Import** on the Actors tab to make a new one, or open a sheet, switch to **Edit** and press the file icon by the name to fill that sheet (it replaces everything on it).
  - Before anything changes, it shows what it found in the compendiums and what it didn't.
  - Characters get the real classes at their levels with their features (and picks such as Weapon Specialisation's weapon), the Kit and its features, the ancestry with its subtype and traits, feats with their attribute and weapon picks, skills, spells, gear and coins. The scores and HP given are the sheet's totals.
  - NPCs take a stat block (Level, HD, HP, AC, saves, attacks, abilities, spellcasting), and can start from a Bestiary monster.
  - Anything it doesn't find comes in as a plain item with the text given, and the report lists it: nothing is guessed, nothing is lost.

## What's new in 0.10.29

The books v0.10.1 (21 October), mirrored.

- **Non-lethal damage:** the Rules journal now says what the sheet does: magical healing removes non-lethal damage equal to the full amount healed, even at full HP.
- **Ranged Attacks** (Book I journal) has one "Range." bullet: normal to the listed range, Disadvantage to twice it, nothing beyond; the second of two listed ranges is long range; reach 5ft or 10ft.
- **Birthright Mount:** the light warhorse is 15 HP (Hit Dice 2d10+4) in the Knight's text and on Sir Durgan Holdfast.
- **Rook Halloway:** Strength 14, from Swift Reflexes' point moved by the starting cap (as Big Wen's Wisdom 14).
- Characters already in a world keep their text and scores: drag Rook or Sir Durgan in again from Pregenerated Characters (or edit by hand) for the new numbers.

## What's new in 0.10.28

The compendiums, the rules and the Rules journals (Books I, II, IV and V) now match the books v0.10.0 (20 October).

- **Turned.** Turn Undead puts the Turned condition on what it turns: Frightened of the turner, and it spends its turns moving away. It lasts 1 minute or until the turner attacks it.
- **Non-lethal damage heals.** Healing removes as much non-lethal damage as it heals (its full amount, so a creature knocked out at full HP wakes), and a full rest clears all of it. The 1 point per hour of rest is still yours to take off by hand.
- **XP carries over.** A single award can't take a character up two levels: it stops 1 XP short of the second.
- **Firearms training** comes from your 1st-level class only. A Wizard who later takes Fighter levels isn't trained.
- **Creation feats over 18.** If a 1st-level character's feat would push an attribute over 18, the sheet asks which attribute gets the point instead. Press Later and the feat's own sheet keeps saying so until you choose; it also shows where a point went, with **Put it back**. Picking a different attribute for the feat asks afresh, and so does a copy of the feat dragged to another character. Big Wen and Rook Halloway already have theirs moved.
- **Classes:** Twin Nock gives each arrow your Bow Mastery bonus, added for you (+1, +2 at 6th, +3 at 12th, +4 at 18th); its old per-arrow table is gone. Aura of Devotion covers the Paladin too. The Cleric's Umberlee wave is a Fortitude save. Holy Campaign is once per year, or once per campaign at the GM's call. Combat Dominance says character Level sets the cap.
- **Spells:** Warlock is on Burning Hands, Scorching Ray, Fireball, Bind Elemental, Darkness, Faerie Fire, Entangle and Hypnotism. Delay Poison holds back poison taken during the spell too.
- **Catalogue and Bestiary:** the light warhorse (2d10+4, 15 HP) and warpony (2d8+2, 11 HP) have Hit Dice, so a Divine Mount gets 24 and 18. Spell-component price ranges say "(by quality)". The Sun Blade has a **Blade called** switch that sheds bright light in a 20ft radius, like the Flame Tongue.
- **Attacks of Opportunity** come only from Combat Reflexes or a monster ability that says so.
- **Kit names** use a comma: "Gladiator, The Pit-Forged".
- Travel distance is in 6-mile hexes.

## What's new in 0.10.27

- **Monster art from your art packs.** Game Settings, **Monster art**: tick the art modules you own (token packs, bestiary or adventure modules with creature art, free packs), press **Scan**, then tick **New monsters from the Bestiary get matched art**. Monsters dragged in from the Bestiary then get the token and portrait with the same name (an Ogre gets the pack's ogre). **Use on monsters already here** does the ones already in the world and their tokens. Nothing is copied: the images stay in the art module, so keep it installed (it can stay switched off). Art you set by hand is never replaced.

## What's new in 0.10.26

- **A duplicated character doesn't carry the world update's backups.** In 0.10.25 a duplicate kept each item's copy of what the update replaced (harmless, but clutter); now only the original has them.

## What's new in 0.10.25

- **The world update keeps a copy of what it replaces.** Each item it changes holds its rules, effects, uses and so on from before, and the GM's update message has **Put back what this update replaced** (it asks first). Uses left and anything picked since stay. Later updates leave what you put back alone, and list it under "Your edits kept" if the compendium changes it again. "Update these anyway" keeps a copy too, and the same button puts that back.
- **The update message lists what's now automatic**, per character ("Rowan Ashby: Crushing Blow"), so a bonus you added by hand for it can come off before it counts twice.
- **A sheet the update couldn't change is tried again** the next time the world loads (the message names it), up to three times in all, instead of waiting for the next version.
- The README no longer compares the system with others.

## What's new in 0.10.24

- **Which weapons are two-handed** (what Crushing Blow and other two-handed features check). The Trident is one-handed. A Lance is two-handed on foot and one-handed when mounted: its row on the sheet has a switch (a horse) that reads **On foot** or **Mounted**: click it when you get on or off. Every other two-slot melee weapon that isn't Versatile stays two-handed. Lances and Tridents already on sheets update with the world update.

## What's new in 0.10.23

- **No more grey boxes.** The book's tables (the Handbook tab in Class details, descriptions on sheets, a class's spell slot table, the ability scores window) stay on the parchment with Foundry's dark theme on, instead of grey rows.
- **The Browser says who it's adding to.** Opened from a character's sheet, their starting gold, or the sidebar button (with their token selected, or as your own character), Add and Buy go to that character until the Browser is opened from somewhere else, and Class details offers "Add to" them. **Just browse**, next to the name, stops that.

## What's new in 0.10.22

- **Crushing Blow updates on existing characters.** The world update listed The Heavy Hand as "Your edits kept" on Fighters who took it before 0.10.18, though nobody had changed it: the weapon pick added in 0.10.18 made those unedited Kits look edited. They update now, and Crushing Blow on their sheets with them (rerolling 1s and 2s on two-handed weapon damage).
- **"Update these anyway" on a Kit** updates the features it gave too (they had stayed as they were). A feature you changed by hand still keeps your change.
- **New characters: questions after the steps.** Weapon Specialisation's "which weapon?" and an attribute pick (a Fighter's Attribute Bonus, Will of Iron as the 1st-level Feat) opened in the middle of the new-character steps. They now come after the steps and the starting gold. If you keep the money and shop, the weapon question opens beside the Catalogue; it lists the Catalogue's weapons, so you can pick before you buy.

## What's new in 0.10.21

- **Class details show the Handbook's key attribute** ("Dexterity / Wisdom" for the Archer, whose Seeker adds Wisdom to bow damage at 16th). The class's own key attribute, which sets its class DC, is unchanged.

## What's new in 0.10.20

- **Tabs work again on Foundry 14.** The Browser's tabs (Equipment, Spells, Feats and the rest) and the Class details tabs did nothing when clicked: Foundry 14 takes over buttons named "tab" for its own tab groups. They have their own action now.
- **Class details** use the sheet's font for their labels and table, without Foundry's heading style showing through; the GM's edit button is a plain pencil.

## What's new in 0.10.19

- **Class details.** Clicking a class (in the Browser, or its name on a character sheet) opens a window made for reading it, not the editing sheet:
  - **Overview:** Hit Die, HP after 10th, key attribute, spellcasting, Base to Hit, weapons, armour, Feat Paths and levels, and a level 1 to 24 table: Base to Hit, abilities gained, Feats, and spell slots for casters.
  - **Abilities:** every class ability by level, each opening to its full text.
  - **Kits:** the class's Kits and what each gives.
  - **Handbook:** the class's full text.
  - From the Browser adding to a character it has an **Add to** button for that character. The GM's pencil still opens the editing sheet.

## What's new in 0.10.18

From a full run-through as a player (a Human Fighter built from scratch to 5th level, a fight and a rest).

**Making a character**
- **The player gets the scores window.** Players can't usually make characters, so the GM makes one and hands it over. If the player already owns it when the GM makes it, the GM isn't asked; the player is, the first time they open its sheet.
- **Ancestry extras are steps of their own.** A Human's extra General Path Feat is a step after the class Feat. Every ancestry with "choose one skill at creation" (Human, Dwarf, Automaton, Aasimar, Goblin, Half-Orc, Half-Elf) gets a **Knack** step: a skill with Advantage on its checks that takes no Skill slot. Where the trait names attributes (Aasimar: a Wisdom or Charisma skill) only those are offered; "a Craft skill" is the GM's call.
- **Knack** is a new skill tier: a plain d20 with Advantage, no slot. A level-up Skill slot can train it (one slot; it keeps the Advantage). A trained skill can't be turned into a Knack (only the GM can, to correct a sheet).
- **Toughness and the like raise current HP too** when taken at creation or on a level up, and each new level adds their per-level HP to current HP as well as the maximum.

**Fighting**
- **Crushing Blow** (The Heavy Hand) works by itself: with a two-handed weapon, the weapon's own damage dice showing 1 or 2 are rerolled once. Bonus dice aren't.
- **Two-handed weapons.** The Catalogue's two-slot melee weapons that aren't Versatile now carry the **Two-handed** trait (28 of them). A Versatile weapon counts when you roll its two-handed die. Add or remove the trait on a weapon to settle it either way.
- **Weapon Specialisation asks which weapon** when it's added, with **Later**; the sheet shows **Choose weapon** until it's picked (two from 13th level). With that weapon its damage bonus is added and the first attack with it each round has Advantage; with any other weapon they're reminders. A "+1 Greatsword" counts as a Greatsword. Brakka, Big Wen and Brenna come with theirs picked.
- **For GMs:** a rule can be limited to some weapons (`weapon`: `two-handed`, or `chosen` for the weapons picked on the item), and `damage.reroll` (value n) rerolls the weapon's own dice showing n or less, once.

**Shopping and resting**
- **Buy** sits beside **Add** in the Browser for anything with a price. It pays from the character's purse (gold, then platinum, then silver for gold prices; smallest coins first for silver and copper prices), puts the item on the sheet as Add does, and says so in chat. Not enough money: it refuses and says why. Where a price has two amounts, Buy charges the first. A player buys only for their own character; **Add** still gives items for free.
- **Resting in a fight asks first:** "<name> is in a fight. Rest anyway?" The party's **Rest the party** asks too, naming everyone still fighting.

## What's new in 0.10.17

- **Attribute choices are never guessed.** Will of Iron, Steady Hand, a Fighter's Attribute Bonus and the like ask which attribute when they're added, with a **Later** button. Until one is picked the item gives no attribute bonus (it used to count the first option silently), and its row on the sheet shows **Choose attribute**. Its other bonuses (Will of Iron's +2 Will) apply either way.
- The pregens Maud (Will of Iron: Wisdom) and Big Wen (Steady Hand: Strength) have their picks set, matching their printed sheets.

## What's new in 0.10.16

- **No reaction tracker.** The lightning markers in the combat tracker, their right-click option and the "already used its reaction" warning are gone. A class feature, kit feature or feat that is a reaction (Riposte, Combat Reflexes) now says so in chat when it's used.

## What's new in 0.10.15

- **Updates are safe for a live campaign.** Each new version brings the feats, features, kits, ancestries, spells and actions already on sheets up to date with the compendiums (rules, effects, uses, activities, saves, damage, areas). It used to happen once, at 0.10.1.
  - **Your edits stay.** An item added from a compendium now remembers what its mechanics were when it arrived. If you change a rule on it, the update leaves that rule alone and lists it in a message to the GM, with an **Update these anyway** button.
  - **Older items are your call.** Items added before this version can't show whether they were edited, so the first time the compendiums have changed, the GM is asked once: **Update them** or **Leave them**. Items that already match the compendium are simply brought into the new tracking.
  - Names, descriptions, uses left and attributes already picked never change, and an item with **Keep my edits** ticked is never touched.

## What's new in 0.10.14

- **No score above 18 at any starting level.** A character made above 1st level is capped at 18 when it gets its first ancestry, and spare ancestry points move to another attribute, as at 1st level (Starting Scores: "the cap applies at any starting level"). Swapping one ancestry for another later, or removing one and adding another, still follows the 20 cap. If a higher-level character's scores were typed in by hand, the box to add the ancestry's changes starts unticked, in case they are already included.
- **Part-time resistances name their type.** A reminder such as Shifter's Beasthide now reads "Resistance slashing 3 Beasthide only", not "+0 (resist)".

## What's new in 0.10.13

- **12 of the last 13 effects are on**, as agreed on the Feature Board:
  - **Turn Undead** (Cleric and Paladin) leaves turned undead Frightened for 1 minute.
  - **Delay Poison** makes the target immune to Poisoned for 1 hour per caster level.
  - **Shifter** gets an on/off switch (it shows as Shifter). Each lineage's benefit is a reminder on the card, not an automatic bonus.
  - **Expanded Mind** and **Iron Discipline** add reminders on spell and save cards.
  - Genasi, Tiefling, Elemental Mastery, Eldritch Invocations, Steadfast Courage and Wall-Forged Dread depend on a choice (caste, bloodline, element, invocation or kit), so they stay as text for you to apply.
- **Aura of Devotion** is unchanged: its aura already reminds allies of Advantage on saves against charm. The Codex doesn't say whether the Paladin benefits too, so that part is left off.

## What's new in 0.10.12

- **Reach outline switch:** the square button in the token tools now lights up and goes dark when you use Shift+R or the setting, not only when you click it.

## What's new in 0.10.11

- **Hovering a monster as the GM** shows its HP and AC with the players' word (Unhurt, Hurt, Bloodied, Near death, Down) under them, so you know what the table sees.

## What's new in 0.10.10

- **Reach outline:** only creatures get it (not item piles, storage, the party token or hazards), and it has a switch in the token tools (the square icon) and a key, Shift+R (change it in Configure Controls).
- **New characters:** the 1st-level steps wait for the ability scores window to close, so the two never open on top of each other.

## What's new in 0.10.9

- **Level up button.** When a character has enough XP, a gold **Level up** button appears by the XP bar (with several classes it asks which one takes the level).
- **Effect durations on Foundry 14.** An effect timed in Foundry's own effect settings (or by a module) now ends with game time on v14 too, and shows its time left.
- Includes 0.10.7: a Feat granted for a level records that level when several levels are taken at once.

## What's new in 0.10.8

- **Making a character is a few short steps, each like the compendium browser.** Instead of one tall window of boxes, a new character goes through: ancestry (if it has none), its subtype, bloodline, caste or lineage (and a Tiefling's family), then Kit, 1st-level Feat, three starting Skills (tick up to three, with a counter) and last the Starting Luck roll. Every step is a searchable list with the full text of the one you click, and says which step it is ("Step 2 of 5"). **Choose later** leaves a step empty; **Skip** stops choosing and goes on to starting gold with what you have picked so far; closing a step stops the setup without adding anything (Hit Points and class features are set either way).

## What's new in 0.10.7

- **Feats record the right level when you level several at once.** Going from 1st to 4th in one go, the 3rd-level Feat now says "taken at level 3", not 4.

## What's new in 0.10.6

- **Choosing a Feat or Skill shows what it does.** The level-up Feat and Skill windows are now like the compendium browser: a searchable list grouped by Path (or attribute) on the left, and the full description of the one you click on the right. The Skill window lists new skills and, in their own group, trained skills you can make Master. In the 1st-level window, picking a Kit, Feat or Skill shows its description under the box.

## What's new in 0.10.5

- **Tidier Hit Points box.** The Non-lethal box is gone: non-lethal damage still comes from damage cards, and when a creature has some a red "Non-lethal N" chip shows under its HP (the GM can clear it). Max HP is typed in edit mode only; Temp stays.

## What's new in 0.10.4

- **Method V follows the Player's Handbook.** The ability scores window rolls Pool 1 8d6, Pool 2 5d6 and Pool 3 4d6 (keeping the highest 3 of each), then 3d6 three times, for Set Alpha and Set Beta. Rule C, the Gygaxian Threshold, is two scores of 14 or higher in the set you keep (a typed-in set too); if neither rolled set has them, roll both again or type in a donated set. A good set you don't keep is posted to chat as one you can donate to the table (Rule B).
- **No score starts above 18.** When an ancestry bonus would take a new character's score past 18, a window asks which attribute gets the extra points (the next best one under 18 is picked for you; it also stops at 18). The move is kept with the ancestry, so removing the ancestry takes it back. Characters past creation are unchanged.

## What's new in 0.10.3

- **Fixes from review and live testing of 0.10.2.** Starting gold can't be run twice by a player, and the free firearm, toolkit and pack aren't given again on a GM re-run; packs can be paid from platinum and silver too. Feats now record the level they were taken at (compendium feats show none until added). The toolkits sit in Tools & Trades. A GM's "add it anyway" on skill slots counts as an extra slot from then on (shown on the sheet). Reactions, rounds left and first-attack checks now find the right combat even when another combat exists in the world.

## What's new in 0.10.2

- **Luck sits with the attributes again**, in the same row; the Method V dice button moved to the end of the row (edit mode).
- **Starting gold and gear.** After a new character's 1st-level setup, a window rolls the class's starting gold (Handbook, Starting Wealth), then offers a starting pack bought from it (Explorer's, Dungeoneer's, Scholar's, Diplomat's, Survivalist's, Healer's Satchel) or keeps the gold and opens the Catalogue to shop. A pack is paid from gold first, then platinum, then silver. Gunslingers pick a free Derringer, Pistol or Dragon Pistol; Artificers get their Kit's toolkit. Closing the 1st-level setup window with its X skips this; Apply or Skip go on to it. The **Starting gold** button by the coins is there until the gold is rolled; after that only the GM sees it, and running it again adds to the gold rolled so far (kept as a total) without giving the free items twice. The Handbook's toolkits are now in the Catalogue (Tools & Trades).
- **Skill slots are enforced.** A character can't take the same skill twice or go over their Skill (NWP) slots (a Master takes two); the GM is asked and can allow it, and the extra slots the GM allows are kept (shown by the slot count, and editable by the GM in edit mode) so later level-ups count them. Several skills added at once are checked together. The level-up skill window is one choice: a new skill or a Master, not both; confirming with nothing picked asks again (Choose later keeps the slot).
- **Where features come from.** Feature rows, item sheets and chat cards show the class or kit and the level (e.g. "Cleric · Level 1"), and ancestry traits say "Ancestry trait"; feats show their path and the level they were taken at (stamped when a feat is added to a character; the pregens carry theirs where the book gives it).
- **Reactions and round timers follow the right encounter.** With more than one encounter in the world, Attack of Opportunity and other reactions are spent (and warned about) in the encounter the creature is fighting in, and spell and effect timers count the rounds of the encounter they started in, not whichever one the tracker shows.

## What's new in 0.10.1
- **Effects on.** Feats, features, kit features, ancestries and spells change your numbers by themselves (AC, saves, attacks, damage, HP, speed), with situational ones as reminders on the cards.
- **Activities.** Features, feats and actions do what they say when you press Use: heal, roll a check, call for a save, make several attacks (Twin Nock, Extra Attack, Flèche), or post a reminder. Counts the Handbook works out (Flèche: your Dexterity modifier a day; Turn Undead: 3 + Wisdom) follow your character.
- **Light timer.** Torches, lanterns and candles burn down in game time (or real time, in Game Settings) and warn their owner when nearly out.
- **Spells audit.** Spells have their saves, damage, areas and effects from the Handbook.
- **Actions from the Handbook.** The Actions & Manoeuvres compendium is the Handbook's own list; Charge gives Advantage on its one melee attack, Push deals no damage, and an Attack of Opportunity spends your reaction when it attacks.
- **Critical range.** With Critical Strike a natural 19 is a critical only if it hits; only a natural 20 hits whatever the AC.
- **Your choice of attribute.** Will of Iron, Steady Hand and the Fighter's Attribute Bonus ask which attribute gets the +1 when you add them (and the item sheet can change it).
- **Existing worlds are updated.** The first time the GM opens a world on 0.10.1, items that came from the compendiums (feats, features, kits, ancestries, spells and actions) get the current rules, effects, uses, activities, saves, damage and areas. Names, descriptions, uses left and anything you made yourself stay. The GM gets a whisper saying how many items changed. To keep your own changes to an item, tick **Keep my edits** on its sheet (tick to stop updates overwriting your edits); this sets the item flag `flags.arneyan.keepCustom`.

## Installing

**On your own copy of Foundry (best for testing)**
1. Unzip so you have a folder called `arneyan` containing `system.json`.
2. Put that folder in your Foundry user data under `Data/systems/`.
3. Restart Foundry. "The Arneyan Codex" appears under Game Systems. Create a world with it.

**On The Forge**
Forge installs systems from a manifest URL:
1. Make a free GitHub repository and upload this folder's contents.
2. Create a Release, attach `arneyan.zip` (the folder zipped), and upload `system.json` to the release as well.
3. In `system.json`, set `manifest` to the release's `system.json` link and `download` to the zip link, then publish.
4. On Forge, install a system from a manifest URL and paste the manifest link. New releases then show as updates.

## Compendiums (built in)

The Catalogue compendium is in eight groups: Weapons, Armour & Shields, Magic Items, Alchemy & Poisons, Spell Components, Adventuring Gear, Food & Drink, and Tools & Trades. The Catalogue's rules (how magic items work, scroll availability, selling) are in Book V of the rules journal, not items.

Open the Compendium sidebar and look in **The Arneyan Codex** folder, or use the book buttons on the character sheet:
- **Classes** (22, plus the Battle Priest Cleric), with full abilities and Spells Per Day tables.
- **Ancestries** (28), **Kits** (by class, including Cleric and Paladin deities), **Feats** (by Path), **Skills (NWP)** (by attribute).
- **Spells** (396, by level) with save, components, range and damage where the spell deals it.
- **The Shopkeeper's Catalogue**: weapons, armour and shields, gear, alchemy and magic items.
- **Rules of Arneyan**: the Core Rules, Character Creation, Spellcasting and Catalogue text as journals.
- **Monsters & Treasure** (GM only, in its own folder): all 464 monsters as NPCs, grouped as in the book.

Drag anything onto a sheet. You can still make your own items from the Items sidebar.

## Making a character
1. Drop a class on a blank character. Max HP is set to the Hit Die maximum + Con and the 1st-level class abilities are added. Then a few steps, each a searchable list with the full text of the one you click: your Kit, 1st-level Feat, three Skills (tick up to three), and last whether to roll Starting Luck (4d6, drop the lowest). Choose later leaves a step empty, Skip goes on to starting gold with what you have picked, and closing a step stops there.
2. Drop an ancestry: speed, size and vision are set, and any old ancestry is replaced.
3. Kit features are added automatically and new ones arrive at the level the kit gives them.

## Levelling up
- Type the new level into the box next to the class name in the sheet header, or press the up or down arrow next to it (or drop the same class again).
- The level-up window lists what the new level brings before you roll: HP, Luck, Base to Hit, saves and DCs, new class and kit abilities, new or unlocked spell slots, and any feat or skill choice coming.
- Hit Points: roll the Hit Die (1s rerolled once) or take the average, + Con, minimum 1. From 11th level it is the class's flat amount. +1 Luck each level.
- Class abilities and kit features for the new level are added; a Feat prompt appears at your class's feat levels and a Skill prompt at 4th, 8th, 12th, 16th, 20th and 24th.
- Typing a lower number levels down, taking away the HP, Luck and features from those levels.

## Multiclassing
- Drop a second class to start it at 1st level. Character Level (the total) sets HP, saves, Skill slots and feat timing; each class level sets that class's abilities, spell slots and spell DC.
- XP to level is the highest class rate + 2 per extra class.
- Armour training comes from your first class only. One kit per class. Feats can come from any of your classes' Paths.

## The Arneyan Browser
The Equipment tab has the Catalogue's groups as tabs to flick through (All, Weapons, Armour & Shields, Magic Items, Alchemy & Poisons, Spell Components, Adventuring Gear, Food & Drink, Tools & Trades), plus **Consumables**: everything you use up, from any group.
- Every book button on the sheet opens the **Arneyan Browser** on the right tab: Equipment, Spells, Actions (manoeuvres), Feats, Class Abilities, Skills, Classes, Ancestries and Kits. There is also a button at the top of the Compendium sidebar.
- Search by name and filter (spell level, class list and school; feat Path; class; attribute; Catalogue section). Opened from a sheet, **Add** puts the item straight on that character; you can also drag any row onto a sheet.
- **Actions & Manoeuvres** is a new compendium with the Codex's basic actions and Combat Manoeuvres. Charging, Offensive Focus, Dodge, Called Shot, Shield Blow, Flank and Rear Attack are switches: turn one on and the sheet adds its Advantage or Disadvantage.

## The effects panel
- The selected token's conditions, effects, switches and Exhaustion show as icons at the top right of the screen (your own character's when nothing is selected). Hover for details; **right-click to remove** (Exhaustion goes down one level, a switch turns off).

## The character sheet
- **Play and Edit mode.** The padlock button (top right) switches. Play mode keeps the sheet clean; Edit mode shows the boxes for attribute scores, max HP, AC and save bonuses, speed and the name. HP, temp HP, Luck, XP and coins can be changed in either mode.
- **Sidebar:** portrait, HP bar with +/- buttons (Shift for 5), AC, BtH, Initiative (click to roll) and Speed, the three saves, DCs, Exhaustion pips, Rest and conditions.
- **Hover any number** (AC, saves, to-hit, Initiative, Speed, HP, attribute scores) to see where it comes from, including feats, gear and spells.
- **Attributes and Luck** sit in one row. Click a modifier to roll a check. Luck shows current over starting Luck; click "Luck" for a Luck Check.
- **Tabs:** Actions (weapons with To Hit and Damage buttons, abilities with uses or switches), Spells, Features, Skills, Inventory, Effects and Biography.
- **Biography and descriptions** open in their own editor window (the Edit button), so nothing on the sheet can hide the text while typing.

## Spells
- Each casting class gets its own section on the Spells tab with its DC and slot pips for each spell level. **Left-click a pip to add a slot back, right-click to spend one;** filled circles run left to right. The "left / total" boxes can be typed in: changing the total adds or removes extra slots for that class. Casting a spell spends one for you.
- Slots come from the class's Spells Per Day table, plus bonus slots from the casting attribute (13+, 16+, 18+; not Sorcerers). Extra slots from items can be added on the class item.
- The cast card has buttons for the save (with the DC), damage or healing, and any effect the spell puts on targets. Concentration spells start concentration on the caster; casting another one ends the first, and the effects it put on others go with it.

## Effects, conditions and automation
- **Rules.** Feats, abilities, ancestries, kit features, gear and spells can carry rules that change numbers automatically: AC, saves, attacks, damage, checks, speed, HP, spell DC, extra slots, Advantage or Disadvantage, resistances and senses. Gear only counts while equipped. Open an item and use its **Effects** tab to see or edit them.
- **Situational rules** ("+2 vs undead") are not added automatically; they show as reminders on the matching chat card.
- **Switches.** Things you turn on and off (Rage, a stance) have a switch on the Actions and Effects tabs.
- **Conditions** from the Codex table (Blinded, Prone, Restrained, Stunned and the rest) are on the token HUD and the Effects tab. They apply their penalties automatically, including the ones that help attackers: attacking a Prone target in melee rolls with Advantage.
- **Effects on others.** Target creatures (T key) and press the "Apply ..." button on a spell card. Effects with a duration count down in combat and end by themselves. The Effects tab lists everything on the character, where it came from and what it changes.
- **Exhaustion** applies its levels through the same rules.
- **Roll bonuses** on the Effects tab add to every attack, weapon damage, spell damage or cantrip damage roll (numbers or dice).

## Resting and Exhaustion
- The Rest button (sidebar) asks where you rest: Safe Haven (largest Hit Die + Con, once per stay), Camp with shelter (Con, minimum 1) or Camp in the open (1 HP). Armour isn't checked: it's assumed to come off for the night, and the GM rules otherwise. A rest removes one level of Exhaustion and refreshes per-day, per-rest and per-encounter abilities and spell slots. Luck never comes back.
- **Per-encounter uses** also come back when the GM ends the combat (deletes it from the tracker).
- **Per-week, per-session and per-month uses** are yours to reset: set the uses back on the feature's sheet when the week (or session, or month) has passed.
- Exhaustion 1-6 (the pips in the sidebar) applies automatically: Disadvantage on Initiative, halved speed, Disadvantage on checks and attacks, halved Max HP, no spellcasting, and death.

## Chat cards
- **Who gets it:** Apply (damage or healing) goes to your **targets**; with nothing targeted, to the tokens you have selected. So you can move your own token, target someone else and hit them, then drop the target to heal yourself.
- **Damage cards:** click the total for the breakdown (formula, modifiers, every die). Extra damage that only sometimes applies (a Flame Tongue while ignited, a versatile weapon two-handed) folds away under "Extra damage that may apply".
- **Spell immunity:** Shield makes its caster immune to Magic Missile; applying Magic Missile damage to a shielded creature does nothing.
- **Attacks** show hit or miss against every targeted token's AC, and who gave Advantage or Disadvantage. Every attack card has **Roll damage** and **Critical** buttons; on a natural 20 Critical damage comes first. A natural 1 says "automatic miss" and has no damage buttons. Saves and checks say "automatic success" on a natural 20 and "automatic failure" on a natural 1.
- **Critical damage** adds the maximum of every damage die in the roll, extra damage and rule dice included (Codex, Critical Hits). A weapon's damage card also has **Roll again as a critical** in case the crit was missed.
- **Damage types:** every damage roll carries its type, and a weapon with extra damage ("+1d6 fire") rolls each type separately: the card shows "7 slashing · 4 fire" and the Apply buttons put each type through the target's immunities, resistances and vulnerabilities on its own. Extra damage with a condition ("against undead", or Versatile's extra die two-handed) is a **Roll again with...** button: it rolls the whole hit again with that added, so resistances and the critical are worked out once. Flat resistances ("Resistance 5 to all") come off once per hit, and halving rounds down once.
- **Damage cards** show the dice, the total and the formula worked out (Burning Hands reads "1d3 + 1", not "min(1,10)"). Buttons apply full, half, double or healing to the **selected** tokens (or your targets if none are selected), with resistances, immunities, vulnerabilities, damage reduction and temporary HP counted. Right-click a damage card for the same options.
- **Save buttons** roll the save for whoever you are **targeting** (then selected tokens, then your own character) against the DC. A player can target a monster and press the button; the GM's client rolls it.
- Applying damage, healing or an effect posts a line saying who did what to whom ("Wiz: Burning Hands. Goblin takes 7 fire damage (resists fire)"). Hit point totals stay off it.
- Players can apply damage and effects to monsters they don't own; the GM's client does it for them.

## Death and dying
Following Death & Dying in the Codex:
- **Monsters** die at 0 HP: the Dead condition goes on (skull on the token, defeated in the combat tracker).
- **Characters** at 0 HP fall **Unconscious** but stable. Below 0 they are **dying** and lose 1 HP at the start of each of their turns in combat (posted in chat) until stabilised. At −10 HP minus their Constitution modifier (−20 from 11th level; a negative modifier counts as 0) they are **Dead**; the sheet shows the number.
- The sheet's banner has **Last Chance** (burn 1 Luck for a Fortitude save, DC 10; a success stabilises them, still unconscious at their current HP) and, for the GM, **Stabilised** (an ally's Wisdom check, DC 10, or First Aid). Taking damage while stable starts the bleeding again.
- **Healing** a creature below 0 HP first sets it to 0, then adds the rest. Back above 0 they wake up.
- This works however HP changes: damage buttons, healing, or a number typed on the sheet.

## Gear
Following Carrying in the Codex and the Catalogue's magic item rules.
- **Slots:** coins 100 a slot, ammunition 30 a slot, and small items (rings, wands, thrown weapons, anything marked "bundles 5/slot") 5 a slot. Each item's sheet has a **Bundle of** box.
- **The Inventory tab** has your coins and the Catalogue at the top, a Catalogue button on each section (it opens on the matching group), and the slot count fixed at the bottom so it's always in view. It's laid out in blocks: **Equipped** (worn and in hand: the shield button on any row, a ring or torch included), then what you carry loose (**Weapons**, **Armour & Shields**, **Equipment**, **Consumables** with a **Use** button), then one block per container (**Backpack**, **Bag of Holding**, sacks) with what's stowed in it. Drag gear onto a container block to stow it; drag it onto the sheet anywhere else to take it out. Equipping something takes it out of its pack.
- **Over the limit:** speed −10ft, and another −10ft for every 5 slots over (1-4 over −10, 5-9 −20, and so on; never below 0), and Disadvantage on Dexterity checks and attack rolls, shown in the effects panel.
- **Giving gear:** the hand button on a row gives it (and anything inside it) to another party member or ally; to someone else's character it goes through the GM.
- **Containers:** a backpack, sack, pouch, quiver, scroll case, Bag of Holding or Portable Hole holds gear. What's in a **Bag of Holding** (8 slots) or **Portable Hole** (20) costs no slots. One extradimensional container won't go inside another (the Catalogue says that ruins both).
- **Ammunition:** bows fire arrows, crossbows bolts, slings stones (Arrows, Silver Arrows, Bolts and Sling Stones are in the Catalogue's Missile Weapons). Each attack spends one; on the Actions tab each weapon has a picker for which stack it draws from. A weapon's sheet sets what it fires, an ammunition stack's sheet what kind it is. Silver ammunition counts as silver against resistances; ammunition with +N in its name adds it to attack and damage and counts as magic.
- **Consumables:** using a potion, oil, poison, flask, torch or scroll uses one up. A healing potion rolls its healing and heals the drinker.
- **Wands and staffs:** the ones that cast spells (Wand of Magic Missiles, Staff of Healing, Staff of the Magi) list them on the **Spells** tab under **Wands, Staffs & Scrolls**, with a Cast button that spends the right charges. They cast at the item's caster level, or the wielder's if it has none (a non-caster: caster level 2 × level − 1, DC 12 + level, as a scroll of unknown origin). At 0 charges a wand or staff rolls a d20 and crumbles on a 1. Staffs regain 1d4 at dawn; the battery button sets charges by hand or rolls the recharge. **Homebrew:** drop spells onto any equipment's sheet (a wand, staff or rod you made) to make it cast them; set each spell's charge cost, its caster level, and what it does in a non-caster's hands there.
- **Light:** Use (or the fire button) lights it; the token gives off its light and it burns out after its hours of game time (a torch, candle or Sunrod is then used up; a lantern just goes out). The Catalogue gives only the Sunrod a radius, so the rest use these: torch 20ft bright and 20ft dim for 1 hour, candle 5 + 5 for 1 hour, hooded lantern 30 + 30 and lamps 15 + 30 for 6 hours, bullseye lanterns a 60ft beam + 60 for 6 hours.
- **Unidentified items (GM):** the eye button on any gear hides what it is; players see "Unidentified longsword", or the name and description you set on its sheet, until you reveal it.
- **Scrolls:** the scroll button on a spell writes a scroll of it (1 week and 100 gp a level; it keeps your caster level and DC). Reading one casts it with no slot; an unidentified scroll needs a casting-stat check against DC 10 + the spell's level first. It crumbles once read. A blank Catalogue scroll ("Scroll, 3rd level") has an **Inscribe** button: pick the spell on it from the Spells compendium, up to its level. Scrolls also show on the Spells tab.
- **Luck (GM):** the + beside a character's Luck gives +1 for a deed true to their Alignment, once a session and never above 20. Levelling up already gives its +1.
- **Weapon modes:** a weapon with a mode (a **Flame Tongue** ignites on a command word) has a switch on its Actions row. While it's on, its mode damage (+1d6 fire) is added to every hit and it gives its light (20ft); off, neither. Any weapon can have one: in the **forge** pick a ready-made mode (Flaming, Frost, Shocking, Thundering, Radiant, Venomous, Corrosive, Shadow, Mindpiercing) or a custom one; on a weapon's sheet tick **Has a mode** and pick a ready-made one, or name it, set its light, and tick **In mode** on the extra damage that goes with it.
- **Iconic weapons** (Flame Tongue, Frost Brand, Sun Blade, Holy Avenger, Dwarven Thrower, Mace of Delving and the rest) are now real weapons with their +N and extra damage.

## Weapons, traits and the Forge
- **Codex traits** are switches on a weapon's sheet (hover for the rule). The system uses them: **Finesse** takes the better of Strength and Dexterity; **Heavy** gives Disadvantage below Strength 13 (always for Small creatures, never for Large); **Versatile** offers its extra die on the damage card; **Armour Piercing** and **Brace** add reminders to the attack card.
- **Extra damage** rows on a weapon add typed damage on a hit (a Flame Tongue's +1d6 fire), with an optional "only when" (Sun Blade's +1d8 radiant against undead).
- **The Forge** (hammer button on any weapon or armour sheet, or on a weapon row in the Browser) makes a magic version from it: a +N (attack and damage, or AC), Codex traits and extra damage. Bonuses go up to +3. It names it for you ("+1 Longsword of Fire"), and puts it on the character it came from or, for the GM, in a **Forged Items** folder in the Items sidebar.

## The party
- The Actors sidebar has a **Player Characters** folder. **Every player character in it is a party member**; drag a character in or out to add or remove them. New player characters go in automatically. The folder and the party can't be deleted, and the folder is always first in the sidebar and can't be dragged elsewhere.
- Inside it, **Allies, Mounts & Pets** holds hirelings, henchmen, mounts, familiars and pets that travel with the party. They aren't members: they don't count towards the party's sight, the encounter budget or the party sheet. It can't be deleted or moved out of the Player Characters folder.
- The **party badge** sits on the folder's header: click it to open the party sheet, drag it onto a scene for the party token.
- **Party sheet:** each member's portrait, class, HP bar, AC, Luck, speed, Exhaustion and conditions (click to open their sheet), the average level and the travel speed (the slowest member).
- **Stash:** shared gear and coins. Drag items in from a sheet or out to one and they move, not copy; or press **Give** on a stash row and pick who gets it. The GM can split the coins between members.
- **Party token for travel:** drag the badge onto a map, or on the GM's side press **Gather** to swap the members' tokens on the scene for the party token, and **Deploy** to put everyone back around it.
- The party token sees as far in the dark as the best-sighted member.

## Encounters
- The combat tracker shows the encounter's budget for the GM: points spent against the party's budget and whether it is easy, hard or deadly, using the Monsters & Treasure rules (Level ladder, crowds, solos, too-strong warnings).
- The **Encounter Builder** (scales button in the tracker, or Encounter on the party sheet): drag monsters in (or use its Bestiary button), set how many, watch the cost, then place them on the current scene, hostile.

## Storage places

A **Storage** actor is a place, not a creature: a bank vault, the chest back home, a ship's hold or wagon, a guild or temple locker. Make one from the party sheet's Stash tab (**New place**) or as an Actor of type Storage.

- **Contents and coins:** drag gear in from a sheet, drag it out to a sheet or press **Take**; **Put in or take out** moves coins between a character and the place. Containers keep their contents, and a Bag of Holding's contents cost no slots here either.
- **Party is here:** the GM's switch in the sheet's header. While it's off, players can see what's stored but can't put anything in or take anything out. The GM always can.
- **Who may use it:** Foundry's own Ownership (right-click it in the Actors sidebar). New places belong to every player.
- **Capacity:** in slots, set by the GM; 0 means no limit (the Catalogue gives chests and barrels none).
- **Ledger:** every deposit and withdrawal, with the game date and who did it, newest first.
- **On the map:** drag it onto a scene for a chest token; double-click to open it. The party sheet lists every place, with Here or Away.

## The compendiums are read-only

The system's compendiums are the books, so they can't be unlocked, emptied or edited in a world, and their sidebar folders stay. To change something, drag it into the sidebar and change the copy (or right-click a compendium and Duplicate it). Installing a new version replaces the compendiums, so anything removed earlier comes back.

Each compendium window has a button that opens the same list in the **Arneyan Browser**, where it can be searched and filtered. The GM's Actors sidebar has a **Bestiary** button: monsters by Level, creature type and solo.

## Monsters
- Each monster has its book stats (Level, HD, HP, AC, speed, morale, saves, attack bonus, number appearing, treasure type), a token sized by creature size (hostile, unlinked) and game-icons.net art.
- **Attacks** are weapons: click to attack, then roll damage. A rider such as "plus 2d8 poison" is its own clickable roll in the attack's description, so resistances apply to each part.
- **Special abilities** are ability items. Saves, damage, conditions and spells in their text are clickable. Uses ("3 times per encounter", "1/day") are tracked.
- **Spellcasters** carry the spells their stat block names and cast at the stat block's DC (edit mode has a Spell DC box). A monster that "casts as an 11th-level cleric" has that class's spell slots, spent as it casts, with pips like a character's. Innate spells count their uses ("Suggestion (3/day)": 2 of 3 left today). **New day** on the Spells tab brings both back.
- **Update from the Bestiary:** monsters already imported into a world keep their old stat blocks after a system update. The rotate button on a monster's sheet, or **Update world monsters** in the Bestiary, copies the current stat blocks over (HP back to full; names you changed stay).
- **Resistances, immunities and vulnerabilities** feed the damage buttons. Weapon resistances only touch slashing, piercing and bludgeoning from a weapon: "non-magical" is beaten by a magic weapon (a +1 or better, or "magic" in its traits), "non-silvered" also by a **Silvered** weapon, "non-adamantine" by an **Adamantine** one. Set what a weapon is made of (Silvered, Adamantine, Cold iron, Mithral, Nalwood) with the **Made of** chips on its sheet, or the Made of choice in the forge. Cold iron and mithral have no automatic rule yet. **Nalwood** (Tariel's steel-hard, fireproof wood, whose field disrupts the Weave): a creature it wounds has Disadvantage on the save to keep concentrating; it isn't magic. Monsters the M&T gives no senses get standard ones for their kind (or a default for their type: undead, constructs and elementals Darkvision 60ft, fiends and aberrations 120ft, oozes Blindsight 60ft); press Update world monsters for ones already imported. Spells like Magic Weapon don't flag a weapon yet, so give it +1 on the sheet while it lasts.
- Editing a monster's Level clears its ½ or ¼; the Fraction box in edit mode sets one.
- Magic Resistance, Pack Tactics, Legendary Resistance and Sunlight Sensitivity add reminder notes to the matching rolls.
- The **Bestiary** tab in the Arneyan Browser (GM only) filters monsters by Level, type, group and solo, with an Encounter button on each row. Drag a row onto the map to place it.

## Changing shape
Polymorph, Wild Shape, Shapechange, Animal Shapes and Polymorph Any Object, following Changing Shape in Spellcasting in Arneyan.
- **Drag a creature onto a sheet** (from the Actors sidebar, a compendium or the Bestiary). A box asks what the creature keeps: its own mind (always, by the rules), its conditions and effects, and, for Wild Shape, its class abilities and feats and any spells it can still cast.
- It takes the form's **whole stat block**: HP, AC, attacks, saves and movement. The form's stat block is an actor named "Ilsa (Wolf)" in a **Transformed** folder, owned by the same players, and the creature's **own token turns into it** where it stands, on every scene: the form's art, size and sight, the same place in the combat tracker. Nothing is hidden or left behind. On return the token turns back (its art, size, sight and, for a monster's unlinked token, its own HP and changes), where the form stood. The creature's own sheet shows a banner while it's out in a form, with **Open the form** and **Return to own form**.
- **At 0 HP** it returns to its own form automatically, with the HP it had when it changed; damage beyond 0 doesn't carry over. Or press **Return to own form** on the banner on its sheet.
- The **paw button** on a sheet offers quick harmless forms from Monsters & Treasure (toad, rat, moth and so on) and **objects** (a teapot, a chair, a statue...). An object keeps the creature's own stats but is helpless (Paralysed, speed 0, no spells) until it returns.
- Players can change their own characters when the GM is online. For Wild Shape they pick from the built-in list of beasts, even when the Bestiary is hidden from them.

## Spell areas
- A spell with an area (96 of them: Fireball, Burning Hands, Lightning Bolt, Web, Cloudkill...) has a **Place area** button on its card, from a slot, a scroll, a wand or a staff.
- Shapes follow the spell's text: a radius is a true circle (not a block of squares), a cone is as wide at the end as it is long, a line is 5ft wide unless the spell says otherwise, and a cube is a square. Earthquake's radius grows with your level.
- On Foundry 14 the shape follows your mouse; the wheel turns it; left-click places it, right-click or Esc cancels. Cones and lines that start from you (Burning Hands, Lightning Bolt) stay on your token and point at the mouse.
- **Everyone inside becomes your target**, so the card's save, damage and effect buttons go straight to them. Walls block the area. If someone moves, press **Target creatures inside** on the area's card.
- **Instant** areas (Fireball) clear at the start of the caster's next turn, or press **Remove area**. **Lingering** areas (Web, Stinking Cloud, Cloudkill) stay for the spell's duration (1 round per level for Stinking Cloud, 10 minutes per level for Web) and are cleared when it runs out in combat; anyone who starts a turn inside gets a card with the save and the damage. Ending concentration clears them too.
- Spells already on sheets from before 0.7.0 get their areas the first time the GM loads the world on this version.
- On Foundry 13 a template appears on the caster; drag it into place and press Target creatures inside.
- If a player can't place an area, check Foundry's permission to create templates (Configure Settings, User Permissions).

## Auras
- An aura follows its creature. The GM's client keeps them up to date as tokens move.
- **Passive auras** put their effect on everyone inside while they're inside: **Aura of Courage** (Paladin 6th, +4 to saves against fear for allies within 10ft, 30ft at 15th, 50ft at 20th), **Aura of Devotion** (18th, Advantage against charm), **Divine Monolith** (+2 to checks and saves within 20ft) and the **Star Spawn Grue's Unease** (−1 to saves).
- **Turn auras** give anyone who starts a turn inside a card with the save, the damage (full or half) and the condition: the **Balor's Fire Aura**, the **Bone Devil's and Pit Fiend's Fear Auras**, the **Bodak's Withering**.
- **Spirit Guardians**: Place area becomes **Start Spirit Guardians**, an aura on the caster that hits enemies who start their turn within 15ft. It ends with concentration.
- Each aura shows a faint ring (green for allies, red for enemies, gold for everyone). Switch the rings off in the settings.
- **Make your own** on any magic item, ability or feat: its Effects tab has an **Auras** section. Set the radius (a number, steps by level like `10; 30 at 15; 50 at 20`, or a formula with @cl), who it touches, rules for those inside, and what happens at the start of a turn inside (save, DC, damage, half on a save, condition).

## Conditions added in 0.7.1
The rest of the Codex's conditions table: **Confused** (a reminder to roll 1d10 each turn), **Shaken** (Disadvantage on the next attack), **Slowed** (half Speed, one attack a round) and **Weakened** (Disadvantage on attacks). The Bone Devil's Fear Aura now offers Shaken.

## Pregenerated characters
The **Pregenerated Characters** compendium (in the Adventures folder) has ready characters for the one-shots:
- **The Broken Anvil:** 15 characters in three folders, Level 1 - The Apprentices, Level 5 - The Journeymen and Level 9 - The Veterans (five seats each, seat 5 being the spare).
- **Jacob's Well:** the four 3rd-level Keepers.
Each is built from the system's own class, ancestry, kit, features, feats, skills, spells and gear, so it works like a character made on the sheet; the printed sheet's text (abilities, personality, tactics) is in its biography. Players can see the compendium: drag a pregen into the Actors sidebar and give the player ownership.

## Ancestry
- **Dropping an ancestry** on a character opens its setup: the **subtype, bloodline, caste or lineage** (a Tiefling's bloodline sets its Resistance 5; a Genasi's caste and a Shifter's lineage set their attributes), a Human's **two +1s**, a Tiefling's **family**, and whether to **add the attribute changes to the scores** (ticked at 1st level; no score goes above 18 at creation, and you pick which attribute takes any points that would). Speed, size and vision follow the ancestry.
- Its **traits** go on the Features tab under the ancestry's name, with the chosen subtype first. The ancestries' own rules (Resistance 5 to poison for a Dwarf, Advantage reminders) apply; numbers a subtype states (a Wood Elf's +5ft speed, a 1st Generation Automaton's +1 AC) apply too.
- **Dropping a class on a character with no ancestry** asks for the ancestry first, so its Constitution counts towards starting HP.
- Removing the ancestry removes its traits and takes back the attribute changes it added.

## New characters
- **A new character asks for its ability scores first:** roll Method V (Set Alpha and Set Beta, each six pools: 8d6, 5d6 and 4d6 keeping the highest 3, then 3d6 three times; the roll goes to chat), keep a whole set (the window flags a set without two scores of 14 or higher, the Gygaxian Threshold, and lets you roll both again if neither has them), or type in a donated set. Then put each number on an attribute, with its modifier shown. The dice button by the attributes (in Edit mode) opens it again.
- Then drop an ancestry and a class: the ancestry steps add its changes, the class steps do HP, kit, feat, skills and Luck.

## Table conveniences
- **Initiative:** starting combat rolls every monster's initiative privately; monsters of the same kind share one roll and act together (switch off in the settings).
- **How hurt it looks:** players hovering a monster see Unhurt, Hurt, Bloodied, Near death or Down; the GM sees its HP and AC.
- **Macro bar:** drag a weapon, spell, ability or potion from a sheet to the macro bar; clicking it uses that item for the selected token, or your character.
- **Rest the party:** the party sheet's Rest button rests every member at once (same rules as each sheet's Rest) with one summary card.
- **Damage goes to the ones hit:** an attack's damage card remembers which targets it hit; Apply puts it on those only (Alt-click to apply to your targets or selection instead). The card lists who was hit and who was missed.
- **Apply by saves:** a spell's damage card has an **Apply by saves** button. Target the creatures that rolled their saves: those who failed take full damage, those who saved take half (or none, if the spell's save negates). A creature with no save against that spell yet is left out and named.
- **Range and reach:** an attack past the weapon's listed range has Disadvantage up to twice that range ("60–200 ft" uses 200), and warns beyond it; a melee attack warns if the target is out of reach (5ft, 10ft with Reach). Casting a spell at a target out of its range warns too.
- **Reach ring:** your selected token shows a faint square at your melee reach (switch off per player in the settings).
- **Floating numbers:** damage and healing pop over the token (red, green, and blue for temporary HP).
- **Undo:** every "who took what" card has an Undo button for the player who applied it (or the GM) that puts the HP back.
- **Defeated monsters:** a monster at 0 HP is marked defeated in the tracker and its turns are skipped; healed above 0, it comes back.
- **Start of turn reminders:** one card to the creature's owners and the GM: concentration, effects ending next turn, ongoing damage, Regeneration and bleeding out.

## Numbered conditions
- **A condition can carry a number**, shown on the token's icon, the token HUD and the effects panel (top right).
- **Left-click** a condition that's on (HUD or panel): +1. **Right-click**: −1, and it goes at 0. Shift + right-click on the panel removes it outright.
- **Timed conditions** (Slowed 2, Frightened 3): the number is rounds left. It goes down one at the end of the creature's own turn and the condition ends at 0. Applying it again keeps the longer. A condition with no number lasts until removed.
- **Burning stacks:** each time a creature is set alight again adds 1d6 (Burning 2 deals 2d6 at the start of its turn). Dousing ends it all.
- **Poisoned by a venom:** the number is the stage, the start-of-turn poison die: 1d4, then 1d6, 1d8 and 1d10 (it climbs each turn until the Fortitude save ends it). Plain Poisoned or Sickened (no number) deals no damage.
- Prone, Unconscious, Petrified, Dead and Concentrating are on or off.

## Using class features
- **Features do what they say:** Lay on Hands rolls its healing (2 HP per Paladin level), Fast Healing heals, Parry rolls the Dexterity check, a Hex calls for the save, and so on. 112 features have these, read from their own text.
- **Several options:** a window asks which (Lay on Hands: Heal, Cure Disease, or Divine Healing from 12th). Options with their own count (Cure Disease per week) don't spend the daily use; damage that steps up with level offers only the step you've reached.
- The feature's sheet lists what it does under **When used**.
- **Uses from a formula.** A feature whose count the Handbook works out (Flèche, Turn Undead, Rage, Discord, Hex, Smite Evil, Wild Surge, Stun Attack, Ingenuity Points, Blood Magic) has a **Uses formula** on its sheet: `max(1, @dex.mod)`, `3 + @wis.mod`, `@cl` (its class level), `@casting.mod` (your best casting attribute), or a level table such as `5:1, 9:2` (1 from 5th, 2 from 9th). The maximum follows your character.
- **Several attacks in one Use** (Extra Attack, Flèche, Twin Nock): a target behind Full Cover is skipped and the other attacks still roll. The use is spent once, when the first attack rolls; nothing is spent if you cancel or nothing rolls.

## Combat rules

### Cover and concealment
Half Cover, Full Cover and Concealed are on the token HUD with the other conditions. Attacks against a creature in Half Cover or Concealed have Disadvantage. A creature in Full Cover can't be targeted: the attack stops with a warning.

### Flanking and crowding
Attack rolls read the map. A melee attack gets Advantage when an ally stands directly opposite you across the target and can reach it. A ranged attack has Disadvantage when an enemy is within 5ft of you, or when the target is next to one of your allies (shooting into melee). The attack card says why. Turn this off in Game Settings ("Flanking and crowding from token positions"). The Flank Attack and Rear Attack switches still work by hand; the Codex has no facing, so Rear Attack is always your call.

### Dual wielding and fighting defensively
Light weapons have an **Off** button next to their to-hit: an off-hand attack with Disadvantage that adds no attribute modifier to damage. Under **Combat** on the Actions tab, **Fight defensively** uses your off-hand weapon or shield instead: a Light weapon gives +1 AC against the first melee attack that round, a Light Finesse weapon +1 AC against every melee attack, and a shield +1 AC against everything (it costs your extra attacks). It lasts until the start of your next turn; click it again to stop.

### Grapple, Trip, Disarm and other contests
Target one creature, then press a contest under **Combat** on the Actions tab (or Use on the action from the Actions compendium). Both sides roll, the better attribute is picked for whoever has the choice, the higher total wins and a tie goes to the defender. The GM's client rolls for creatures you don't control. A win applies the result: Grapple makes the target Restrained, Trip and Overbear knock it Prone, Dirty Trick Blinds it until the end of its next turn, Disarm says it drops its weapon. A Restrained creature gets a **Break free** button. Entangling weapons give Advantage on Trip and Grapple, Sunder weapons on Disarm. Monsters roll d20 + the attribute modifier from their stat block, as characters do.

### Non-lethal damage
Every damage card has a fist button to apply it as non-lethal (subdual) damage. Unarmed strikes are non-lethal by default, with a **Lethal** button for the rest. Non-lethal damage builds up apart from HP and shows as a red **Non-lethal** chip under it; when it reaches the creature's current HP, it is knocked out (Unconscious, not dying). The **Unarmed strike** button under Combat adds an Unarmed Strike (1d2 + Strength) to your weapons the first time. The GM clears it with the chip's cross once the creature has recovered.

### Morale
Click Morale on a monster's sheet, or right-click it in the combat tracker, to roll 2d6 against its Morale Score. Higher than the score breaks it. From the tracker, a group of the same monster rolls once. Effects with the `morale` rule key raise or lower the score.

### Reactions
Reactions aren't tracked: only some classes have them. Using a class feature, kit feature or feat that is a reaction (a Swashbuckler's Flourish Manoeuvres such as Riposte, Combat Reflexes) posts a short note in chat saying so, once the attack or check has rolled. General manoeuvres such as Attack of Opportunity and Parry, and monster abilities, post no note.

### Firearms
Attack cards check the gun's Misfire Threshold from the Catalogue. A misfire jams the gun (no damage buttons) and it asks to be cleared before it fires again. A natural 1 also rolls the catastrophe d6: damaged, backfire, destroyed or explosion, with a damage card aimed at the right creatures. Reliable guns misfire only on a 1; Silent Mechanism never does. Gunslingers, Fighters, Rangers and Tenor Hold dwarves are trained; anyone else ticks **Trained** under Combat if their backstory or downtime gave it. Untrained shooters have Disadvantage, and a would-be critical jams instead. Firearm damage dice explode.

## GM tools


**Ask for a roll.** From the party sheet (Ask for a roll) or the Token tools on the left (the d20 button), pick a saving throw, an attribute check or a skill, and a DC (Easy 10, Moderate 12, Hard 15, Severe 20). Everyone you tick gets a Roll button on one chat card. Each player rolls their own character; the GM can roll for anyone, or press "roll for the rest" for absent players. Results fill into the card with a tick or a cross, and Luck burned afterwards updates them. Someone without the skill rolls it untrained. Tick selected tokens in the window to ask monsters or NPCs too.

**Award XP.** Award XP on the party sheet gives XP to everyone or to the members you tick: the same amount each, or split between them. XP carries over past the character's rate (the XP per level of their class), but one award stops 1 XP short of a second level. Anyone with enough XP shows "Level up" on the party sheet and in the award card. Taking the level with the level-up arrow spends that level's XP and keeps the rest.

**Treasure.** A gem button next to a monster's name (GM only) rolls its Treasure code: individual treasure (P to S) for each creature, a hoard (A to H) once for the group, and the lair hoard if you tick it. Gems are named from the Catalogue's stones, art objects from the book's examples, and magic items link to the Catalogue entry. You can turn part of a hoard's coin into lots of trade goods. "Put it in the party stash" adds the coins to the stash's coins and everything else as items (a "Weapon +1" stays a placeholder until you pick the weapon). The Encounter Builder's "Roll their treasure" does the same for every creature in the encounter.

**Encounter Builder.** "Save for later" keeps the encounter in the world's list of saved encounters; click one to load it. The dice button on a foe rolls its No. appearing as the count (Shift-click for the lair number). The menu by "Place on the current scene" can roll every group's No. appearing (in the wild or in the lair) as they are placed.

**Tables of Arneyan.** A compendium of roll tables from the books: gems (Lesser, Fine, Superb, and the stones of each tier), art objects, trade goods, magic items by rarity (with the iconic item tables, linked to the Catalogue), Unique powers and quirks, the travel Encounter Check, Reaction Checks, a firearm's catastrophic misfire, and the tables in Confusion, Prismatic Spray, Contact Other Plane, the Wand of Wonder and the Efreeti Bottle.

**Hazards and traps.** Create an Actor of type "Hazard or trap". Its sheet holds how to spot it (a Wisdom check and DC), how to disarm it (an attribute check or a skill, and DC), what triggers it, what it does (an attack, a save with damage and a condition), its reset or routine, and its AC, Hardness and HP if someone smashes it. "Ask the party" posts a group roll to spot or disarm it. "Trigger it" posts a card with the attack, save and damage buttons; the damage card has the usual Apply and Apply by saves buttons. A complex hazard rolls initiative and shows its routine on its turn.

**Environmental hazards.** The thermometer in the Token tools opens the clocks for holding your breath (and drowning), extreme heat and extreme cold, for the selected tokens or the whole party. The breath clock moves on with each combat round (or Next round): it counts down each creature's breath (1 + Constitution modifier minutes, at least 30 seconds), then the rounds until it falls unconscious at 0 HP, then dying. Rough water adds a Strength check each round. Heat and cold post each hour's Fortitude save (DC 10, +2 an hour) as a group roll, with Disadvantage for medium or heavy armour in the heat and Advantage for warm clothing, a fire or shelter in the cold; a button gives those who failed a level of Exhaustion. Quick cards cover flames, smoke, acid and lava.

## Time, companions and travel

### Game time

Effects now run on the game clock as well as in combat. A spell or ability effect with a duration (rounds, minutes, hours or days) ends when that much game time has passed, in or out of combat; while its own combat is running, the combat's rounds end it as before. Numbered conditions (Stunned 2) also count down with game time outside combat. Concentration ends when the spell's own duration runs out. Lit torches and lanterns already burn down with game time.

A small clock above the player list shows the game date and time. The GM's buttons move it on 10 minutes, 1 hour, 8 hours (a night's rest; use Rest on the party sheet for its benefits) or 1 day. A world setting hides the clock from players.

### Summoning

Cast a summoning spell (Summon Monster, Summon Animals, Summon Elemental and the rest) and its chat card gets a
**Summon creatures** button. Pick the creatures from the Bestiary within the spell's limits (Levels, how many, the kind of creature); they appear beside the caster, belong to the caster's player, and join the caster's combat acting straight after the caster. They leave when the spell's duration ends (rounds in combat, game time outside it), when concentration ends (Summon Swarm), when they drop to 0 HP, or when dismissed from the caster's sheet. You can have only one spell-made attacker at a time: summoning again, or casting Spiritual Weapon, Animate Objects, Mordenkainen's Sword and the like, sends the last one away.

A Warlock's **Pact Summons** card has a **Call your patron's servant** button: choose the tier (each spends a slot of its tier, a 5th-level slot for Tier 4) and combat (1 minute) or ritual (1 hour). The servant comes from your Path's Shared Summons; Tier 1 servants arrive with double HP and damage dice. A slain servant can't be called again until a long rest.

### Familiars, companions and mounts

The **Companions** box on a character's sheet holds familiars, animal companions, mounts and pets. Press + and pick what it is (the sheet offers what your class, kit and spells give you) and which creature, or drop any creature from the Bestiary on the box. Each one gets its own small sheet in Allies, Mounts & Pets, owned by the same player, with its stats from the class text, and they follow your level:

- Witch, Familiar: 1 HP per two Witch levels (minimum 1), AC 14.
- Wizard, Summon Familiar: half your maximum HP.
- Ranger (Beast Master), Bonded Companion: Hit Dice equal to half your Ranger level, rounded up.
- Paladin, Divine Mount and Knight, Birthright Mount: a light warhorse (or a war pony for a small Paladin).
- Artificer (Construct Engineer), Construct Companion: built to its chassis (Guardian, Scout or Striker).
- Any mount or pet: its Bestiary stat block.

The box shows each one's portrait, HP and AC, with buttons to put it on the map beside you (or find it there) and to let it go. An active summon shows there too, with its time left and a Dismiss button.

### Downtime

Characters have a **Downtime** tab: a log of what they did between adventures. **New activity** offers the Codex's downtime activities: Earn Income, Craft, Brew a Potion, Make a Magic Item, Copy a Spell, Scribe a Scroll, Research a Spell, Learn a Skill, Train, Treat a Disease, Side Quest, and anything else the GM rules on. Each one works out the days and the gold, takes the coins (tick "Paid already" if you've paid), rolls the check where the Codex gives one, pays out income or returns half the gold on a failed craft, and adds a line to the log. Results can be edited afterwards.

### Travel

The party sheet has a **Travel** tab. Set the distance in hexes, how the party travels (on foot, mounted or by ship, or an Umbral Journey), the pace, and whether the terrain is difficult (one pace slower): it shows hexes a day, days to go and the rations needed against what the members and the stash carry. Each day the GM presses **Travel one day**: game time moves on a day, everyone eats a day's rations (a Week's Rations pack holds seven) and drinks a day's water (a canteen or waterskin holds a day's water until refilled; tick "Water along the way" when there are streams and wells), and the Encounter Check is rolled (d12: 11 a Hard Encounter, 12 a Deadly one), drawing from the encounter roll table named on the tab (or one called Travel Encounters, Random Encounters or the like). Going without food past 3 + Constitution modifier days, or without water, brings Exhaustion.

## Spells, kits and optional modules

### Class-only spells, Patrons and Kits

The spells that only appear in a class entry are in the **Spells** compendium too, each in its class's folder: the Witch's hexes and class-only spells, the Necromancer's class-only spells, and the Warlock's Eldritch Blast, Enslave and Slay Living. Drag them onto a sheet like any other spell.

The Witch's **Patrons** and the Artificer's **Kits** are in the **Kits** compendium (Witch and Artificer folders). Drop one on a character and its features arrive at the right levels: a Patron's Buff at 1st, Curse at 6th and Physical Change at 12th; a Kit's features at 1st, 3rd, 7th, 11th, 15th and 24th. An Artificer Kit's description lists its Workshop options (infusions, chassis mods, gadgets or formulas).

### Optional modules

The system works on its own. If these modules are active, it uses them:

- **Dice So Nice**: every roll shows 3D dice, including damage, healing, rest and level-up rolls. Damage dice take the colour of their damage type (fire, cold, acid and the rest use Dice So Nice's own looks; slashing, piercing, bludgeoning and healing have Arneyan ones). Change the looks in Dice So Nice's Dice Roles settings, or switch off "Apply optional dice role appearances" to keep your own dice.
- **Item Piles**: loot piles, vaults and merchants use Arneyan coins (pp, gp, sp, cp) and gear, with quantities and Catalogue prices (the first price listed counts, in gold). Gear that changes hands arrives unequipped.
- **Token Action HUD Core**: select a token for a HUD of its attacks, manoeuvres, spells by level (prepared ones, with slots left), abilities with uses, saves, attribute checks, skills, conditions, initiative, Luck and rest. Click to use, as on the sheet (Shift for Advantage, Ctrl for Disadvantage); right-click an item to open it. With several tokens selected it shows saves, checks, conditions and initiative for all of them. No separate "Arneyan" HUD module is needed.

## Targeting
- **Alt + right-click** a token to target or untarget it without losing your other targets.

## Tokens
- Player characters' tokens are linked to their actors, so anything changed on the sheet reaches the token on the map. New characters are set up this way, and the first time the GM loads a world on this version, older characters and their placed tokens are linked too. Monsters stay unlinked so every goblin has its own HP.
- **Vision follows senses:** a creature with Darkvision 60ft (from its ancestry, stat block or an effect) gets a token that sees 60ft in the dark. **Low-Light Vision** gives Foundry's light amplification (dim light reads as bright, but it needs some light). **Truesight**, **Blindsight** and **Tremorsense** become the token's See All, Sense All and Feel Tremor detection modes at their ranges. Every token of a character, monster or the party gets vision this way, including monsters imported from older versions; nothing is saved to the token, so the token settings still show your own values. A longer range or a vision mode you set in a token's settings yourself is kept. Turn it off in the system settings if you'd rather set vision by hand.
- **Size follows the sheet:** change a creature's Size (the Description tab on a monster, the Biography tab on a character) and its tokens resize: Tiny ½ square, Small and Medium 1, Large 2, Huge 3, Gargantuan 4. Small, Medium and Large are the Codex's sizes for characters; Tiny, Huge and Gargantuan come from Monsters & Treasure. This can be switched off in the settings too.
- **In any description or journal:** `@Check[ref|dc:14]` makes a clickable save, `@Check[str|dc:15]` an attribute check, `@Damage[2d6 fire]` a damage roll, `@Condition[prone]` a link that puts Prone on the targeted tokens.

## Handbook page links
- Game Settings > Configure Settings > The Arneyan Codex: pick the Player's Handbook and Monsters & Treasure PDFs (upload them to your Foundry data first).
- Every item has a Book and Page field. The book icon on the sheet opens the PDF at that page.
- In any description or journal, write `@PHB[134]` or `@MT[52]` to make a page link. `@PHB[134]{Fireball}` sets the link text.
- If the PDF Pager module is active and you enter the name of the journal holding the PDF, links open inside Foundry instead of a browser tab.

## How rolls work
- **Click** a name to roll. **Shift-click** for Advantage, **Ctrl-click** (Cmd on Mac) for Disadvantage. They never stack and one of each cancels out.
- **Attribute check:** d20 + attribute modifier.
- **Skill (NWP):** Trained adds the modifier (+1 if it is 0 or less). Master adds the same with Advantage. "Untrained check" rolls a plain d20.
- **Saves:** d20 + attribute modifier + half character level (minimum 1). Fortitude uses Con, Reflex uses Dex, Will uses Wis.
- **Attacks:** d20 + attribute modifier + BtH + magic + rules, against every targeted token's AC. Finesse weapons use the better of Str and Dex.
- **Damage:** weapon dice + the same modifier + magic. Natural 20 attacks add the maximum of the weapon's own dice. Shift-click the damage on the sheet to roll a critical by hand.
- **Natural 20 / 1:** automatic success / failure on every d20 roll except initiative and Luck Checks.
- **Luck Check:** roll-under against current Luck. A natural 1 always succeeds and a natural 20 always fails.
- **Burn Luck:** every roll card for a character has a Burn Luck button. Each point adds +1 and is taken off current Luck.
- **Initiative:** d20 + Dex modifier + rules (Exhaustion 1 gives Disadvantage).

## What the sheet works out for you
- Level (all class levels added up), BtH (best class progression), XP needed per level (highest class rate, +2 per extra class).
- AC: 10 + armour + shield + Dex, with Dex capped at +2 in medium armour and none in heavy.
- Saves, Class Save DC and spell DC per casting class.
- NWP slots used and available, inventory slots against the Strength limit (coins at 100 per slot).
- Death threshold (−10 minus Con, −20 minus Con from 11th level) and dying state.
- Long Rest restores spell slots and daily abilities. Luck does not recover with rest.

## Not in this version yet
- Monster attribute scores: stat blocks don't list them, so they sit at 10.
- The effects for the book's feats, class features, kits, ancestries and spells go in once the GM has approved the list. The engine, conditions and the item Effects tab are already here, so you can add your own now.

## Credits
Icons by Lorc, Delapouite and contributors at game-icons.net, CC BY 3.0.

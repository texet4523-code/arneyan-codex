# The Arneyan Codex for Foundry VTT

Version 0.9.1 · Foundry v13 and v14

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
1. Drop a class on a blank character. Max HP is set to the Hit Die maximum + Con, the 1st-level class abilities are added, and a window asks for your Kit, 1st-level Feat (if the class gets one), three Skills and whether to roll Starting Luck (4d6, drop the lowest).
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
- **Attributes and Luck** sit in one row, DCC style. Click a modifier to roll a check. Luck shows current over starting Luck; click "Luck" for a Luck Check.
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
- The Rest button (sidebar) asks where you rest: Safe Haven (largest Hit Die + Con, once per stay), Camp with shelter (Con, minimum 1) or Camp in the open (1 HP). Medium or heavy armour worn means no recovery. A rest removes one level of Exhaustion and refreshes per-day abilities and spell slots. Luck never comes back.
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
- **The Inventory tab** has your coins and the Catalogue at the top, a Catalogue button on each section (it opens on the matching group), and the slot count fixed at the bottom so it's always in view. It's laid out like PF2e: **Equipped** (worn and in hand: the shield button on any row, a ring or torch included), then what you carry loose (**Weapons**, **Armour & Shields**, **Equipment**, **Consumables** with a **Use** button), then one block per container (**Backpack**, **Bag of Holding**, sacks) with what's stowed in it. Drag gear onto a container block to stow it; drag it onto the sheet anywhere else to take it out. Equipping something takes it out of its pack.
- **Over the limit:** speed −10ft, and another −10ft for every 5 slots over (1-4 over −10, 5-9 −20, and so on; never below 0), and Disadvantage on Dexterity checks and attack rolls, shown in the effects panel.
- **Giving gear:** the hand button on a row gives it (and anything inside it) to another party member or ally; to someone else's character it goes through the GM.
- **Containers:** a backpack, sack, pouch, quiver, scroll case, Bag of Holding or Portable Hole holds gear. What's in a **Bag of Holding** (8 slots) or **Portable Hole** (20) costs no slots. One extradimensional container won't go inside another (the Catalogue says that ruins both).
- **Ammunition:** bows fire arrows, crossbows bolts, slings stones (Arrows, Silver Arrows, Bolts and Sling Stones are in the Catalogue's Missile Weapons). Each attack spends one; on the Actions tab each weapon has a picker for which stack it draws from. A weapon's sheet sets what it fires, an ammunition stack's sheet what kind it is. Silver ammunition counts as silver against resistances; ammunition with +N in its name adds it to attack and damage and counts as magic.
- **Consumables:** using a potion, oil, poison, flask, torch or scroll uses one up. A healing potion rolls its healing and heals the drinker.
- **Wands and staffs:** the ones that cast spells (Wand of Magic Missiles, Staff of Healing, Staff of the Magi) list them on the **Spells** tab under **Wands, Staffs & Scrolls**, PF2e style, with a Cast button that spends the right charges. They cast at the item's caster level, or the wielder's if it has none (a non-caster: caster level 2 × level − 1, DC 12 + level, as a scroll of unknown origin). At 0 charges a wand or staff rolls a d20 and crumbles on a 1. Staffs regain 1d4 at dawn; the battery button sets charges by hand or rolls the recharge. **Homebrew:** drop spells onto any equipment's sheet (a wand, staff or rod you made) to make it cast them; set each spell's charge cost, its caster level, and what it does in a non-caster's hands there.
- **Light:** Use (or the fire button) lights it; the token gives off its light and it burns out after its hours of game time (a torch, candle or Sunrod is then used up; a lantern just goes out). The Catalogue gives only the Sunrod a radius, so the rest use 5e's: torch 20ft bright and 20ft dim for 1 hour, candle 5 + 5 for 1 hour, hooded lantern 30 + 30 and lamps 15 + 30 for 6 hours, bullseye lanterns a 60ft beam + 60 for 6 hours.
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
- **Resistances, immunities and vulnerabilities** feed the damage buttons. Weapon resistances only touch slashing, piercing and bludgeoning from a weapon: "non-magical" is beaten by a magic weapon (a +1 or better, or "magic" in its traits), "non-silvered" also by a **Silvered** weapon, "non-adamantine" by an **Adamantine** one. Set what a weapon is made of (Silvered, Adamantine, Cold iron, Mithral, Nalwood) with the **Made of** chips on its sheet, or the Made of choice in the forge. Cold iron and mithral have no automatic rule yet. **Nalwood** (Tariel's steel-hard, fireproof wood, whose field disrupts the Weave): a creature it wounds has Disadvantage on the save to keep concentrating; it isn't magic. Monsters the M&T gives no senses get their 5e ones (or a default for their type: undead, constructs and elementals Darkvision 60ft, fiends and aberrations 120ft, oozes Blindsight 60ft); press Update world monsters for ones already imported. Spells like Magic Weapon don't flag a weapon yet, so give it +1 on the sheet while it lasts.
- Editing a monster's Level clears its ½ or ¼; the Fraction box in edit mode sets one.
- Magic Resistance, Pack Tactics, Legendary Resistance and Sunlight Sensitivity add reminder notes to the matching rolls.
- The **Bestiary** tab in the Arneyan Browser (GM only) filters monsters by Level, type, group and solo, with an Encounter button on each row. Drag a row onto the map to place it.

## Changing shape
Polymorph, Wild Shape, Shapechange, Animal Shapes and Polymorph Any Object, following Changing Shape in Spellcasting in Arneyan.
- **Drag a creature onto a sheet** (from the Actors sidebar, a compendium or the Bestiary). A box asks what the creature keeps: its own mind (always, by the rules), its conditions and effects, and, for Wild Shape, its class abilities and feats and any spells it can still cast.
- It takes the form's **whole stat block**: HP, AC, attacks, saves and movement. The changed creature is a new actor named "Ilsa (Wolf)" in a **Transformed** folder, owned by the same players. Its token takes the original's place on every scene, in combat too, and the original token is hidden.
- **At 0 HP** it returns to its own form automatically, with the HP it had when it changed; damage beyond 0 doesn't carry over. Or press **Return to own form** on the banner on its sheet.
- The **paw button** on a sheet offers quick harmless forms from Monsters & Treasure (toad, rat, moth and so on) and **objects** (a teapot, a chair, a statue...). An object keeps the creature's own stats but is helpless (Paralysed, speed 0, no spells) until it returns.
- Players can change their own characters when the GM is online. Players can't see the Monsters & Treasure compendium, so for Wild Shape the GM drags the form on, or imports a few beasts to the Actors sidebar and shares them.

## Spell areas
- A spell with an area (96 of them: Fireball, Burning Hands, Lightning Bolt, Web, Cloudkill...) has a **Place area** button on its card, from a slot, a scroll, a wand or a staff.
- Shapes follow the spell's text, D&D style: a radius is a true circle (not a block of squares), a cone is as wide at the end as it is long, a line is 5ft wide unless the spell says otherwise, and a cube is a square. Earthquake's radius grows with your level.
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
- **Dropping an ancestry** on a character opens its setup: the **subtype, bloodline, caste or lineage** (a Tiefling's bloodline sets its Resistance 5; a Genasi's caste and a Shifter's lineage set their attributes), a Human's **two +1s**, a Tiefling's **family**, and whether to **add the attribute changes to the scores** (ticked at 1st level; no score goes above 18 at creation, and you're told which points to move). Speed, size and vision follow the ancestry.
- Its **traits** go on the Features tab under the ancestry's name, with the chosen subtype first. The ancestries' own rules (Resistance 5 to poison for a Dwarf, Advantage reminders) apply; numbers a subtype states (a Wood Elf's +5ft speed, a 1st Generation Automaton's +1 AC) apply too.
- **Dropping a class on a character with no ancestry** asks for the ancestry first, so its Constitution counts towards starting HP.
- Removing the ancestry removes its traits and takes back the attribute changes it added.

## New characters
- **A new character asks for its ability scores first:** roll Method V (two sets of six pools, 8d6 down to 3d6, best three dice each; the roll goes to chat), keep a set (the window flags a set without two scores of 15 or more, and lets you roll again if neither has them), or type in a donated set. Then put each number on an attribute, with its modifier shown. The dice button by the attributes (in Edit mode) opens it again.
- Then drop an ancestry and a class: the ancestry window adds its changes, the class window does HP, kit, feat, skills and Luck.

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
- Class-only and Path spells (Necromancer, Witch, Warlock) are described in their class entries, not yet separate spell items.

## Credits
Icons by Lorc, Delapouite and contributors at game-icons.net, CC BY 3.0.

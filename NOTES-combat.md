# NOTES: combat (Drop 2 combat rules)

New code: `arneyan/module/combat.mjs`, `arneyan/templates/actor/combat-tools.hbs`, `arneyan/styles/combat.css`,
`arneyan/assets/conditions/{cover,fullcover,concealed}.svg`, `arneyan/assets/icons/action-dust-cloud.svg`, `test/combat.mjs`.

Small hunks in shared files: `documents.mjs` (rollAttack, rollDamage, applyDamage, `_onUpdate`, `ArneyanItem.use`),
`rolls.mjs` (damageRoll flags), `chat.mjs` (non-lethal on Apply, undo, socket relay, right-click menu, off-hand rerolls),
`sheets.mjs` (actions, context, off-hand flag, Morale stat), `actor-sheet.hbs` (Non-lethal box, Off button, combat tools partial),
`damage-card.hbs` (non-lethal buttons), `arneyan.mjs` (one import, one call), `build/build_actions.py` (Dirty Trick, Use notes).

## 1. system.json changes

Add the stylesheet (nothing else: no new packs or document types; Dirty Trick goes into the existing Actions pack):

```json
"styles": [
  "styles/arneyan.css",
  "styles/combat.css"
]
```

## 2. README sections to add

### Cover and concealment
Half Cover, Full Cover and Concealed are on the token HUD with the other conditions. Attacks against a creature in Half Cover or Concealed have Disadvantage. A creature in Full Cover can't be targeted: the attack stops with a warning.

### Flanking and crowding
Attack rolls read the map. A melee attack gets Advantage when an ally stands directly opposite you across the target and can reach it. A ranged attack has Disadvantage when an enemy is within 5ft of you, or when the target is next to one of your allies (shooting into melee). The attack card says why. Turn this off in Game Settings ("Flanking and crowding from token positions"). The Flank Attack and Rear Attack switches still work by hand; the Codex has no facing, so Rear Attack is always your call.

### Dual wielding and fighting defensively
Light weapons have an **Off** button next to their to-hit: an off-hand attack with Disadvantage that adds no attribute modifier to damage. Under **Combat** on the Actions tab, **Fight defensively** uses your off-hand weapon or shield instead: a Light weapon gives +1 AC against the first melee attack that round, a Light Finesse weapon +1 AC against every melee attack, and a shield +1 AC against everything (it costs your extra attacks). It lasts until the start of your next turn; click it again to stop.

### Grapple, Trip, Disarm and other contests
Target one creature, then press a contest under **Combat** on the Actions tab (or Use on the action from the Actions compendium). Both sides roll, the better attribute is picked for whoever has the choice, the higher total wins and a tie goes to the defender. The GM's client rolls for creatures you don't control. A win applies the result: Grapple makes the target Restrained, Trip and Overbear knock it Prone, Dirty Trick Blinds it until the end of its next turn, Disarm says it drops its weapon. A Restrained creature gets a **Break free** button. Entangling weapons give Advantage on Trip and Grapple, Sunder weapons on Disarm. Monsters use their save minus half their Hit Dice.

### Non-lethal damage
Every damage card has a fist button to apply it as non-lethal (subdual) damage. Unarmed strikes are non-lethal by default, with a **Lethal** button for the rest. Non-lethal damage builds up in the **Non-lethal** box beside HP; when it reaches the creature's current HP, it is knocked out (Unconscious, not dying). The **Unarmed strike** button under Combat adds an Unarmed Strike (1d2 + Strength) to your weapons the first time. Clear the box with its cross once the creature has recovered.

### Morale
Click Morale on a monster's sheet, or right-click it in the combat tracker, to roll 2d6 against its Morale Score. Higher than the score breaks it. From the tracker, a group of the same monster rolls once. Effects with the `morale` rule key raise or lower the score.

### Reactions
Not tracked (Kieran, 20 Oct 2026: only some classes have reactions). A class feature, kit feature or feat that is a reaction posts "<name> is a reaction." in chat when used; general manoeuvres and monster abilities post nothing.

### Firearms
Attack cards check the gun's Misfire Threshold from the Catalogue. A misfire jams the gun (no damage buttons) and it asks to be cleared before it fires again. A natural 1 also rolls the catastrophe d6: damaged, backfire, destroyed or explosion, with a damage card aimed at the right creatures. Reliable guns misfire only on a 1; Silent Mechanism never does. Gunslingers, Fighters, Rangers and Tenor Hold dwarves are trained; anyone else ticks **Trained** under Combat if their backstory or downtime gave it. Untrained shooters have Disadvantage, and a would-be critical jams instead. Firearm damage dice explode.

## 3. For the book chat

1. **Non-lethal damage, how it heals.** Settled by the books v0.10.0 and v0.10.1: healing removes non-lethal damage equal to the full amount healed (even at full HP), and a full rest clears it all; the 1 point per hour of rest is left to the GM. The creature wakes as soon as its HP is above its non-lethal total (`syncSubdual`).
2. **Non-lethal and other details.** Temporary HP soaks non-lethal damage first; resistances and immunities apply as usual. The Unconscious entry says "damage rouses" a creature knocked out by subdual damage, but the subdual rule says it is out while subdual equals or exceeds current HP. Built: the threshold wins, so more damage doesn't wake it while it's still over.
3. **Off-hand damage** "adds no modifier": built as no attribute modifier; a magic weapon's +N still adds.
4. **Contests and natural 20/1.** Core Resolution says a natural 20 always succeeds and a 1 always fails. Built: a natural 20 beats any non-20, a 1 loses to any non-1, both the same goes to totals, ties to the defender, an automatic failure (Paralysed) loses to everything.
5. **"Their choice" / "your choice".** The system picks the better attribute for whoever chooses (modifier, with Advantage counting as +3). No dialog.
6. **Overbear** uses the Grapple contest (Strength vs Strength or Dexterity), needs the target already Restrained, and keeps the one-size-larger limit.
7. **Breaking free** from a grapple: the held creature's Strength or Dexterity (best) against the grappler's Strength; Small creatures have Advantage (Size: Small).
8. **Flanking geometry.** "Directly opposite" is read as: a line from your centre to the ally's centre crosses two opposite sides (or corners) of the target's space. The ally must be able to act and within its reach of the target (5ft, 10ft with a Reach weapon, +5ft if Large or bigger).
9. **Rear Attack.** The current Codex has no facing and no Rear Attack manoeuvre (it is only in the older table the Actions pack is built from). It stays a manual switch.
10. **Ranged crowding** (Ranged Attacks) is automated too: close quarters (an able enemy within 5ft of you) and shooting into melee (an able ally within 5ft of the target). Say if this should be manual.
11. **Fighting defensively duration.** The weapon rows say "that round"; built as until the start of your next turn, like the shield. The Light weapon's "first attack" is the first melee attack against that creature in the combat round (read from the chat log); outside combat it always counts.
12. **Shield defence cost** ("costs your extra attacks; if you have none, your attack has Disadvantage") is a reminder on the attack card, not automatic.
13. **Firearms training.** Gunslinger, Fighter or Ranger at any level, or an ancestry mentioning Tenor Hold, counts as trained. Weapon Proficiency says allowed weapons come from the 1st-level class only: should a later Fighter level count?
14. **Silent Mechanism and the untrained critical.** Built: Silent Mechanism never jams, even for an untrained shooter's critical.
15. **Backfire.** The listed damage is rolled without exploding and the card says to press ½ for the wielder (rounded down).
16. **Disarm** posts "drops its weapon"; nothing is unequipped automatically.
17. **Dirty Trick once per fight** is remembered per combat encounter; outside combat it isn't tracked.
18. **The Actions pack** is still built from the older Codex markdown (it has Feint, Called Shot, Offensive Focus, Parry and Rear Attack, which Book I no longer lists, and lacked Dirty Trick, now added). Rebuild it from Book I?
19. **Effects to review** (rule keys now exist; nothing switched on): Two-Weapon Fighting `no.offhand.dis 1`; Fighter Manoeuvre Mastery 13 `adv.contest.trip/disarm/dirty 1`; Street Grappler and Monk Hand-to-Hand `adv.contest.grapple 1`, `adv.contest.overbear 1`; Sure Footing `adv.contest.escape 1`; Knight Battle Lord `morale +N` on allies, Demoralise `morale -N` on enemies; Combat Sense and Foresight `no.flanked 1`; class/ancestry firearm training `firearms.trained 1`.

## 4. Left undone, and why

- **Firearm ammunition and reloading.** Catalogue guns have no ammunition type, so bullets aren't spent, and reload rounds aren't tracked. The jam card states the clearing time. (Gear data, not combat rules.)
- **Multi-Shot, Tethering, Quick Reload, Signal** traits aren't automated.
- **Out-of-turn attacks** don't spend the reaction automatically (a Readied attack would be charged wrongly). Click the marker.
- **Extra reactions** (Swashbuckler's Second Flourish) aren't tracked: one marker per creature.
- **Luck burned on a contest roll** after it resolved doesn't change the posted result; the GM adjusts.
- **Heavily obscured** (guessing the square) and **Unseen** aren't automated.
- **Charging / Brace / Receiving Charge, Shield Wall, Guard, Push** unchanged.
- The rest of the Ranged Attacks page (range bands) was already in place.

## 5. How to test in Foundry

1. **Cover.** Put Half Cover on a goblin from its token HUD; target it and attack: card shows Disadvantage "Goblin: Half Cover". Swap to Full Cover: the attack stops with a warning. Concealed behaves like Half Cover.
2. **Flanking.** Fighter left of a goblin, ally directly right of it (or diagonally opposite corners): melee attack has Advantage "Flanking with ...". Move the ally to a side square: no Advantage. Turn off the setting: none either way. The Flank Attack switch still adds it.
3. **Crowding.** Archer with a hostile token adjacent: bow attack has Disadvantage (close quarters). Shoot a goblin adjacent to an ally: Disadvantage (shooting into melee).
4. **Off-hand.** Equip a dagger: click **Off** beside its to-hit. Card title "Dagger: Off-hand Attack", Disadvantage "Off-hand"; Roll damage has no Dex.
5. **Fight defensively.** With a Light Finesse weapon equipped, Actions tab > Combat > Fight defensively: effect appears; a goblin's melee attack against you shows AC +1, a ranged one doesn't. Light (non-finesse): only the first melee attack that round gets +1. Start of your next turn: effect ends.
6. **Contests.** Target a goblin and press Grapple: your Strength check, then (on the GM's client for a player) the goblin's check, then a result card; on a win the goblin has "Grappled by ..." (Restrained). On the goblin's sheet press Break free. Trip: Prone. Dirty Trick: Blinded 1, gone at the end of its next turn; a second Dirty Trick in the same fight is refused. Overbear on a non-Restrained target is refused. Give the fighter a Net (Entangling): Grapple has Advantage.
7. **Non-lethal.** Roll damage and press the fist: report says "non-lethal", HP unchanged, Non-lethal box goes up. Push it to the current HP: "Knocked out (non-lethal)" appears. Heal above it: it wakes. Undo puts the box back. Unarmed strike: card's main button says "Apply (non-lethal)", **Lethal** beside it.
8. **Morale.** Set a monster's Morale to 7 (edit mode), click Morale: 2d6 card, "Breaks" on 8+. Add an effect with `morale` -2: it breaks on 6+. Right-click in the combat tracker: Morale check for its group.
9. **Reactions.** Start combat: no lightning markers. Use a Swashbuckler's Riposte: a chat note says it's a reaction. Use Attack of Opportunity or Parry: no note.
10. **Firearms.** Give a Wizard a Pistol: attack shows Disadvantage "Untrained with firearms". Roll until a natural 1 or 2 (or Shift-click a few times): "Misfire: Pistol jams", no damage buttons; the next attack asks whether it was cleared. A natural 1 adds the catastrophe card. Tick **Trained** under Combat: no Disadvantage. Wheellock Pistol only misfires on a 1; Gnomish Wind Rifle never. Damage of a 2d6x gun shows exploding dice.

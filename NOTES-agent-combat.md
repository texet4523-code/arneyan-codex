# NOTES: Crushing Blow and Weapon Specialisation (combat18)

Approved by Kieran in chat, 20 Oct 2026. Bullets for the README (not edited here):

## README bullets

- **Crushing Blow** (The Heavy Hand kit) works by itself: damage rolls with a two-handed weapon reroll each of the weapon's own dice that shows a 1 or 2, once. Bonus dice (riders, Versatile's extra die) are not rerolled. The damage card says "Crushing Blow: 1s and 2s on the weapon's damage dice rerolled once".
- **Two-handed weapons.** Weapons from the Catalogue that need both hands (its two-slot melee weapons, bar the Versatile ones) now carry the **Two-handed** trait. A Versatile weapon counts as two-handed when you press its two-handed die on the damage card. Copies already on sheets from before this version count too if they are two-slot melee weapons that aren't Versatile or Light; add the Two-handed (or One-handed) trait to a weapon to settle it either way.
- **Weapon Specialisation** asks which weapon when it's added (creating a Fighter or levelling up). **Later** leaves it unpicked: the sheet row shows **Choose weapon**, and its bonuses stay reminders. The item sheet has a select for it (two from 13th level), offering your weapons and every weapon in the Catalogue. With the picked weapon, the +1/+2/+3 damage is added and the first attack with it each round has Advantage; with any other weapon they are reminders on the card. A magic or renamed copy of the same weapon counts ("+1 Greatsword" is a Greatsword). At 13th the "+1 more to the first weapon" option is still the GM's call: add a damage rule.
- The pregens with Weapon Specialisation (Brakka, Big Wen, Brenna) come with their weapon picked, as their printed sheets say.
- **For GMs: weapon rules.** A rule can be scoped to some weapons (`weapon`: `two-handed`, or `chosen` for the weapons picked on the item). It counts only on attack and damage rolls with a weapon that fits; elsewhere its "only when" shows as a reminder. New rule key `damage.reroll` (value n): the weapon's own damage dice showing n or less are rerolled once.
- **World update.** A weapon picked on Weapon Specialisation is the player's choice: the update keeps it and never lists it as a GM edit. The new blank weapon scope on every other rule is no change either, so rules nobody edited still update.

## Notes for Kieran / the book chat

1. **Which weapons are two-handed.** The Catalogue has no Two-handed trait; it marks "two-handed weapons, polearms, and other long/bulky weapons" with a dagger sign (two slots). Built: every two-slot melee weapon that isn't Versatile gets the trait (28: Greatsword, Axe Two-Handed, Great Club, Maul, the polearms, Pike, Trident, both Lances, Hafted Hook, Man Catcher, Sleeve Tangler, Great Scimitar...). Lances and the Trident are arguable (often one-handed); ranged weapons (bows, Heavy Crossbow, long guns) are left out, since Crushing Blow is a melee kit. Easy to change in `build/build_gear.py`.
2. **First attack with the weapon.** Specialisation's Advantage is tracked per weapon each round (a dagger attack first doesn't use it up), the same way Bless-style first-attack Advantage is tracked. Outside a started combat every attack counts as the first, as before.

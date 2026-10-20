# Arneyan rule vocabulary (effects layer)

A **rule** is `{ "key": string, "value": string|number, "label": string (optional), "when": string (optional) }`.

- Dice in `applies` values and rounds ("1d4" rounds, "2d4" to a score) are rolled once when the effect lands.
- `value` is a number, or a formula string using `@level` (character level), `@half` (half level, min 1),
  `@cl` (level of the class that granted it, or caster level for spells), `@abilities.str.mod` etc.
  For damage keys it may be dice, written with a leading sign: `"+1d6"`, `"+2"`.
- `when`: a short condition ("vs undead", "while raging", "against traps"). A rule with `when` is NOT applied
  automatically; it is shown as a reminder note on the matching roll. Use it whenever the bonus is situational.
- `label`: optional override of the source name shown in breakdowns.

## Keys

Numbers (added):
- `ability.str` `ability.dex` `ability.con` `ability.int` `ability.wis` `ability.cha` (adds to the score)
- `ac`
- `attack` (all attack rolls), `attack.melee`, `attack.ranged`
- `damage`, `damage.melee`, `damage.ranged` (weapon damage; dice allowed: "+1d6")
- `spell.damage`, `cantrip.damage` (dice allowed)
- `spell.dc`, `class.dc`
- `save` (all three), `save.fort`, `save.ref`, `save.will`
- `check` (every attribute check incl. skills), `check.str` … `check.cha`, `skill` (skill/NWP checks only)
- `init`, `speed` (feet), `hp.max`, `hp.level` (HP per character level), `nwp` (extra skill slots),
  `inventory` (extra inventory slots), `slots.1` … `slots.9` (extra spell slots of that level, each casting class)

More numbers:
- `ac.base` (unarmoured base AC, e.g. 13 for Mage Armour; the highest applies, only without body armour)
- `crit.range` (attacks crit on this natural roll or higher, e.g. 19)
- `dr` (damage reduction against every hit)
- `heal.perdie` (extra HP per healing die rolled)
- `speed.fly` (fly speed in feet)

Applied once when an effect lands (only inside `applies`):
- `hp.temp` (temporary HP; dice allowed, e.g. "1d8")
- `exhaustion` (levels of Exhaustion gained)

Multipliers and flags:
- `speed.mult` (0.5 halves, 2 doubles, 0 = speed 0; several multiply together), `hp.mult` (0.5 halves Max HP)
- `no.cast` (1 = cannot cast spells), `no.act` (1 = no actions or reactions), `no.reactions` (1)

Advantage (+1) / Disadvantage (-1), on the creature's own rolls:
- `adv.attack`, `adv.attack.melee`, `adv.attack.ranged`, `adv.attack.first` (the first attack each round only), `adv.attack.first.melee` (the first melee attack each round only: Charge)
- `adv.save`, `adv.save.fort`, `adv.save.ref`, `adv.save.will`
- `adv.check`, `adv.check.str` … `adv.check.cha`, `adv.skill`
- `adv.init`, `adv.luck`, `adv.concentration`

Against this creature (when it is the target):
- `adv.against` (+1: attacks against it have Advantage; -1: Disadvantage), `adv.against.melee`, `adv.against.ranged`
- `crit.against.close` (1: melee hits from within 5ft are critical)

Automatic failure (value 1):
- `fail.save.fort` `fail.save.ref` `fail.save.will`, `fail.check.str` … `fail.check.cha`

Traits (value is a word):
- `resist`, `immune`, `vuln` (damage type: fire, cold, poison, slashing ... or `all`; `resist` may carry an amount, "fire 5", which takes 5 off instead of halving; `immune` may be `condition:<id>` for immunity to a condition)
- `sense` (e.g. "Darkvision 60ft")

Notes (value is reminder text shown on the matching chat card):
- `note.attack`, `note.damage`, `note.save`, `note.check`, `note.skill`, `note.spell`, `note.init`

## Containers

- **passive**: the item's `rules` apply all the time while the item is on the character
  (gear only when equipped).
- **toggle**: the item has `toggle: true`; its rules apply only while switched on (Rage, a stance, Defensive Fighting).
- **applies**: a spell or ability puts an effect on `self` or `target`(s) when used:
  `{ "name", "target": "self"|"target", "rounds": number|formula (0 = until removed; 10 rounds = 1 minute),
     "statuses": [condition ids], "rules": [...] }`.
  Concentration spells are linked to the caster automatically.

## Condition ids

blinded, burning, charmed, deafened, dominated, frightened, incapacitated, invisible, paralysed,
petrified, poisoned, prone, restrained, stunned, unconscious (Exhaustion is a separate 1-6 track).

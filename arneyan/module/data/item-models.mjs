import { ARNEYAN } from "../config.mjs";

const { NumberField, StringField, HTMLField, SchemaField, BooleanField, ArrayField, ObjectField } = foundry.data.fields;

const int = (initial = 0, opts = {}) => new NumberField({ required: true, nullable: false, integer: true, initial, ...opts });
const num = (initial = 0, opts = {}) => new NumberField({ required: true, nullable: false, initial, ...opts });
const str = (initial = "") => new StringField({ required: true, blank: true, initial });
const choice = (choices, initial) => new StringField({ required: true, blank: false, initial, choices: () => choices });

/** Shared fields: description and handbook page reference. */
function base() {
  return {
    description: new HTMLField({ required: true, blank: true }),
    source: new SchemaField({
      book: new StringField({ required: true, initial: "phb", choices: () => ARNEYAN.books }),
      page: int(0, { min: 0 })
    })
  };
}

/** One rule of the effects layer (see effects.mjs and build/effects/VOCAB.md). */
export const ruleField = () => new SchemaField({ key: str(), value: str(), when: str(), label: str() });

/** Effects an item gives: passive or switchable rules, and effects it puts on targets when used. */
export function effectFields() {
  return {
    rules: new ArrayField(ruleField()),
    toggle: new BooleanField({ initial: false }),
    active: new BooleanField({ initial: false }),
    applies: new ArrayField(new SchemaField({
      name: str(),
      target: new StringField({ required: true, blank: false, initial: "target", choices: () => ({ self: "Self", target: "Targets" }) }),
      rounds: str(),
      statuses: new ArrayField(new StringField({ required: true, blank: false })),
      rules: new ArrayField(ruleField())
    })),
    /** Auras this grants (see module/auras.mjs): radius, who, rules for those inside, what happens at their turn. */
    auras: new ArrayField(new ObjectField())
  };
}

/** Shared fields for carried gear. */
function gear() {
  return {
    quantity: int(1, { min: 0 }),
    slots: num(1, { min: 0 }),
    /** How many fit in those slots: ammunition 30, minor items 5, coins 100 (0 = each one takes the slots). */
    bundle: int(0, { min: 0 }),
    price: str(),
    equipped: new BooleanField({ initial: false }),
    /** The container (an item on the same sheet) this is kept in. */
    inside: str(),
    /** Unidentified items show players a plain name and description until the GM reveals them. */
    identified: new BooleanField({ initial: true }),
    unidentifiedName: str(),
    unidentifiedDescription: new HTMLField({ required: true, blank: true })
  };
}

/** Slots a stack takes: bundles count per bundle, everything else per item. */
export function stackSlots(sys) {
  const qty = sys.quantity ?? 1;
  if (sys.bundle > 0) return qty > 0 ? Math.ceil(qty / sys.bundle) * (sys.slots || 1) : 0;
  return (sys.slots || 0) * qty;
}

class BaseItemData extends foundry.abstract.TypeDataModel {
  prepareDerivedData() {
    if ("slots" in this) this.totalSlots = stackSlots(this);
    // Filled in by the actor: the slots of what's inside this container.
    if (this.container) this.contents = 0;
  }
}

export class ClassData extends BaseItemData {
  static defineSchema() {
    return {
      ...base(),
      levels: int(1, { min: 0, max: 24 }),
      hitDie: choice(ARNEYAN.hitDice, "d8"),
      hpBeyond10: int(2, { min: 0 }),
      bthProgression: choice(Object.fromEntries(Object.entries(ARNEYAN.bthProgressions).map(([k, v]) => [k, v.label])), "martial"),
      keyAbility: choice(ARNEYAN.abilities, "str"),
      castingAbility: new StringField({ required: true, blank: true, initial: "", choices: () => ARNEYAN.castingAbilities }),
      xpRate: int(10, { min: 1 }),
      weapons: str(),
      armour: str(),
      /** Spells Per Day: 24 rows (levels 1 to 24) of 10 numbers (cantrips, then 1st to 9th). */
      slotTable: new ArrayField(new ArrayField(new NumberField({ required: true, nullable: false, integer: true, initial: 0 }))),
      /** HP gained at each level, filled in on level up. */
      hpRolls: new ArrayField(new NumberField({ required: true, nullable: false, integer: true, initial: 0 })),
      luckGains: new ArrayField(new NumberField({ required: true, nullable: false, integer: true, initial: 0 })),
      /** Character levels at which a Feat is gained (follows the first class). */
      featLevels: new ArrayField(new NumberField({ required: true, nullable: false, integer: true, initial: 1 })),
      /** Feat Paths this class may choose from. */
      featPaths: new ArrayField(new StringField({ required: true, blank: false })),
      /** Class features granted at each class level (compendium references). */
      features: new ArrayField(new SchemaField({
        level: int(1, { min: 0 }), name: str(), uuid: str()
      })),
      /** Spell slots spent and extra slots, per spell level (cantrips, then 1st to 9th). */
      slotsUsed: new ArrayField(new NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 })),
      extraSlots: new ArrayField(new NumberField({ required: true, nullable: false, integer: true, initial: 0 }))
    };
  }
  prepareDerivedData() {
    this.bth = ARNEYAN.bth(this.bthProgression, this.levels);
  }
}

export class AncestryData extends BaseItemData {
  static defineSchema() {
    return {
      ...base(),
      size: choice(ARNEYAN.sizes, "medium"),
      speed: int(30, { min: 0 }),
      vision: str(),
      attributes: str(),
      /** Read from the text at build time (build_ancestry_choices.py): attribute changes, Human's +1/+1 of choice,
       *  the Traits bullets, the subtype/bloodline/caste/lineage choice, and the Tiefling's family. */
      bonuses: new ObjectField(),
      pickTwo: new BooleanField({ initial: false }),
      family: new BooleanField({ initial: false }),
      traitList: new ArrayField(new ObjectField()),
      choice: new ObjectField({ required: false, nullable: true, initial: null }),
      ...effectFields()
    };
  }
}

export class KitData extends BaseItemData {
  static defineSchema() {
    return {
      ...base(), className: str(),
      /** Kit features, each gained at a class level. */
      features: new ArrayField(new SchemaField({
        name: str(), level: int(1, { min: 0 }), description: new HTMLField({ required: true, blank: true }),
        ...effectFields()
      }))
    };
  }
}

export class FeatData extends BaseItemData {
  static defineSchema() {
    return { ...base(), path: str(), levelTaken: int(1, { min: 0 }), ...effectFields() };
  }
}

export class SkillData extends BaseItemData {
  static defineSchema() {
    return {
      ...base(),
      ability: choice(ARNEYAN.abilities, "int"),
      tier: choice(ARNEYAN.skillTiers, "trained")
    };
  }
}

export class AbilityData extends BaseItemData {
  static defineSchema() {
    return {
      ...base(),
      kind: choice(ARNEYAN.abilityKinds, "class"),
      uses: new SchemaField({
        value: int(0, { min: 0 }),
        max: int(0, { min: 0 }),
        per: new StringField({ required: true, blank: true, initial: "", choices: () => ARNEYAN.usesPer })
      }),
      save: new StringField({ required: true, blank: true, initial: "", choices: () => ARNEYAN.saveTypes }),
      dc: new NumberField({ required: false, nullable: true, integer: true, initial: null }),
      damage: str(),
      damageType: new StringField({ required: true, blank: true, initial: "", choices: () => ({ "": "Untyped", ...ARNEYAN.damageTypes }) }),
      /** Level gained and the class (or kit) it came from. */
      level: int(1, { min: 0 }),
      className: str(),
      /** What a player picks when using it (Lay on Hands: Heal, Cure Disease, Divine Healing). Several: a prompt. */
      activities: new ArrayField(new SchemaField({
        name: str(),
        kind: str("note"),          // heal, temp, damage, check, save, note
        formula: str(),
        damageType: str(),
        ability: str(),
        save: str(),
        text: str(),
        minLevel: int(0, { min: 0 }),
        cost: int(1, { min: 0 }),  // uses spent from the feature's own uses
        per: str(),                // an option with its own frequency ("week") that isn't tracked here
        target: str(),
        removeConditions: new BooleanField({ initial: false })
      })),
      ...effectFields()
    };
  }
}

export class WeaponData extends BaseItemData {
  static defineSchema() {
    return {
      ...base(),
      ...gear(),
      damage: str("1d6"),
      damageType: new StringField({ required: true, blank: true, initial: "slashing", choices: () => ARNEYAN.damageTypes }),
      ability: choice(ARNEYAN.weaponAbilities, "str"),
      ranged: new BooleanField({ initial: false }),
      range: str(),
      magic: int(0),
      attackBonus: int(0),
      traits: str(),
      /** The ammunition it fires ("arrow", "bolt", "stone", "bullet"); blank needs none. */
      ammoType: str(),
      /** Which stack on the sheet it draws from (blank: the first that fits). */
      ammoId: str(),
      /** Extra typed damage on a hit ("+1d6 fire"); with `when` it's offered as a button, not added ("against undead"). */
      bonusDamage: new ArrayField(new SchemaField({
        formula: str(),
        type: new StringField({ required: true, blank: true, initial: "", choices: () => ({ "": "Same as the weapon", ...ARNEYAN.damageTypes }) }),
        when: str(),
        /** Only while the weapon's mode is on (a Flame Tongue ignited), and then on every hit. */
        mode: new BooleanField({ initial: false })
      })),
      /** A weapon with a mode it's switched into (Flame Tongue: "Ignited"); `active` says it's on. */
      modeLabel: str(),
      /** Light it gives off while its mode is on, in feet (Flame Tongue: 20). */
      modeLight: num(0, { min: 0 }),
      ...effectFields()
    };
  }
}

export class ArmourData extends BaseItemData {
  static defineSchema() {
    return {
      ...base(),
      ...gear(),
      category: choice(ARNEYAN.armourCategories, "light"),
      ac: int(1),
      magic: int(0),
      traits: str(),
      ...effectFields()
    };
  }
}

export class EquipmentData extends BaseItemData {
  static defineSchema() {
    return {
      ...base(), ...gear(),
      /** Ammunition: what kind it is, matched to a weapon's ammoType. */
      ammoType: str(),
      /** A container: what it holds, and whether its contents count (a Bag of Holding's don't). */
      container: new SchemaField({
        holds: new BooleanField({ initial: false }),
        capacity: num(0, { min: 0 }),
        weightless: new BooleanField({ initial: false }),
        extradimensional: new BooleanField({ initial: false })
      }),
      /** Used up when used (potions, oils, scrolls); heal is a formula rolled as healing. */
      consumable: new SchemaField({
        use: new BooleanField({ initial: false }),
        heal: str()
      }),
      /** Wands and staffs: charges, a recharge at dawn (staffs 1d4) and the d20 crumble at 0. */
      charges: new SchemaField({
        value: int(0, { min: 0 }),
        max: int(0, { min: 0 }),
        recharge: str(),
        crumble: new BooleanField({ initial: false })
      }),
      /** A light source: radius in feet, how long it burns (hours, 0 = until put out), and whether it's lit. */
      light: new SchemaField({
        bright: num(0, { min: 0 }),
        dim: num(0, { min: 0 }),
        hours: num(0, { min: 0 }),
        lit: new BooleanField({ initial: false }),
        litAt: num(0),
        /** 360 all round; less for a beam (a bullseye lantern's 60-degree cone). */
        angle: num(360, { min: 1, max: 360 })
      }),
      /** A spell scroll: the spell, and the writer's caster level and save DC. */
      scroll: new SchemaField({
        spell: new ObjectField({ required: false, nullable: true, initial: null }),
        cl: int(0, { min: 0 }),
        dc: int(0, { min: 0 })
      }),
      /** Spells a wand or staff casts, with the charges each costs, and the caster level it casts at (0: the wielder's). */
      itemSpells: new ArrayField(new SchemaField({ name: str(), cost: int(1, { min: 0 }), uuid: str() })),
      castLevel: int(0, { min: 0 }),
      /** In a non-caster's hands (Staff of the Magi: caster level 12, DC 18). */
      nonCasterCl: int(0, { min: 0 }),
      nonCasterDc: int(0, { min: 0 }),
      ...effectFields()
    };
  }
}

export class SpellData extends BaseItemData {
  static defineSchema() {
    return {
      ...base(),
      level: int(1, { min: 0, max: 9 }),
      className: str(),
      school: str(),
      castingTime: str("1 action"),
      range: str(),
      duration: str(),
      area: str(),
      components: str(),
      concentration: new BooleanField({ initial: false }),
      ritual: new BooleanField({ initial: false }),
      prepared: new BooleanField({ initial: false }),
      classes: new ArrayField(new StringField({ required: true, blank: false })),
      reversible: new BooleanField({ initial: false }),
      costly: new BooleanField({ initial: false }),
      save: new StringField({ required: true, blank: true, initial: "", choices: () => ARNEYAN.saveTypes }),
      saveEffect: str(),
      damage: str(),
      damageType: new StringField({ required: true, blank: true, initial: "", choices: () => ({ "": "None", ...ARNEYAN.damageTypes }) }),
      /** The area it fills, for Place area: circle, cone, line or rect; size in feet; attached = moves with the caster. */
      template: new SchemaField({
        type: str(), size: num(0, { min: 0 }), width: num(0, { min: 0 }),
        attached: new BooleanField({ initial: false }), fromSelf: new BooleanField({ initial: false }), lingering: new BooleanField({ initial: false }),
        /** How long a lingering area lasts, in rounds (a formula with @cl): "1*@cl", "100". Blank: until removed. */
        rounds: str(),
        /** A size that grows with level (Earthquake: "min(5*@cl, 100)"); blank: the size above. */
        sizeFormula: str()
      }),
      ...effectFields()
    };
  }
}

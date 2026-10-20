import { ARNEYAN } from "../config.mjs";
import { ModSet, wordList } from "../effects.mjs";

const { NumberField, StringField, HTMLField, SchemaField, BooleanField } = foundry.data.fields;

const int = (initial = 0, opts = {}) => new NumberField({ required: true, nullable: false, integer: true, initial, ...opts });
const str = (initial = "") => new StringField({ required: true, blank: true, initial });
const pick = (choices, initial, blank = false) => new StringField({ required: true, blank, initial, choices: () => choices });

/**
 * A hazard or trap, PF2e style: how to spot it, how to disarm it, what sets it off and what it does
 * (an attack, a save and damage), and how tough it is if someone smashes it.
 */
export class HazardData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const abilities = () => ARNEYAN.abilities;
    const saveKeys = () => Object.fromEntries(Object.entries(ARNEYAN.saves).map(([k, s]) => [k, s.label]));
    return {
      level: int(1, { min: 0, max: 30 }),
      /** Simple hazards act once when triggered; complex ones roll initiative and act each round. */
      complex: new BooleanField({ initial: false }),
      kind: pick({ trap: "Trap", environmental: "Environmental", magical: "Magical", haunt: "Haunt" }, "trap"),
      /** Noticing it: a Wisdom check (noticing, searching) against this DC, unless the GM picks another attribute. */
      spot: new SchemaField({ ability: new StringField({ required: true, blank: false, initial: "wis", choices: abilities }), dc: int(12, { min: 0, max: 60 }), notes: str() }),
      /** Disarming it: an attribute check, or an NWP named here, against this DC. */
      disable: new SchemaField({ ability: new StringField({ required: true, blank: false, initial: "int", choices: abilities }), skill: str(), dc: int(15, { min: 0, max: 60 }), text: str() }),
      trigger: str(),
      effect: str(),
      attack: new SchemaField({ label: str(), bonus: int(0), damage: str(), damageType: str() }),
      save: new SchemaField({
        key: new StringField({ required: true, blank: true, initial: "", choices: saveKeys }),
        dc: int(12, { min: 0, max: 60 }), damage: str(), damageType: str(),
        onSave: pick({ half: "Half damage", negates: "No effect", none: "Full damage anyway" }, "half"),
        condition: str()
      }),
      reset: str(),
      attributes: new SchemaField({
        hp: new SchemaField({ value: int(0), max: int(0, { min: 0 }), temp: int(0, { min: 0 }) }),
        ac: int(10),
        hardness: int(0, { min: 0 }),
        init: int(0)
      }),
      saves: new SchemaField({
        fort: new SchemaField({ value: int(0) }),
        ref: new SchemaField({ value: int(0) }),
        will: new SchemaField({ value: int(0) })
      }),
      details: new SchemaField({
        immunities: str(),
        resistances: str(),
        description: new HTMLField({ required: true, blank: true })
      })
    };
  }

  prepareDerivedData() {
    const s = this;
    const base = { level: s.level, half: ARNEYAN.halfLevel(s.level), cl: s.level };
    const mods = new ModSet([
      ...wordList(s.details.resistances).map(v => ({ key: "resist", value: v, label: "Hazard", when: "", data: base })),
      ...wordList(s.details.immunities).map(v => ({ key: "immune", value: v, label: "Hazard", when: "", data: base }))
    ]);
    Object.defineProperty(s, "mods", { value: mods, configurable: true, enumerable: false, writable: true });
    for (const [k, cfg] of Object.entries(ARNEYAN.saves)) {
      const sv = s.saves[k];
      sv.label = cfg.label;
      sv.parts = [{ label: "Hazard", value: sv.value }];
    }
    s.acTotal = s.attributes.ac;
    s.dr = s.attributes.hardness;
    s.traits = { resist: mods.traits.resist.map(t => t.value), immune: mods.traits.immune.map(t => t.value), vuln: [], senses: [] };
    s.attributes.state = s.attributes.hp.max > 0 && s.attributes.hp.value <= 0 ? "broken" : "";
    s.noAct = false;
    s.noCast = true;
  }

  getRollData() {
    return { level: this.level, half: ARNEYAN.halfLevel(this.level), cl: this.level, abilities: { dex: { mod: 0 } }, dex: { mod: 0 } };
  }
}

/**
 * The Forge: make a magic weapon or armour from any ordinary one, PF2e style. The base item is the template;
 * the forge adds a +N (attack and damage for weapons, AC for armour, and it counts as magic against
 * non-magical Resistance), Codex traits (Finesse, Reach...), and extra typed damage ("+1d6 fire").
 * The result goes on the character the template came from, or into the Items sidebar for the GM.
 */
import { ARNEYAN } from "./config.mjs";

const { DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const DICE = ["", "1d4", "1d6", "1d8", "1d10", "2d6", "2d8", "3d6"];
const FOLDER = "Forged Items";

/** Trait names on an item, as a list ("Light, Finesse" -> ["Light", "Finesse"]). */
export function traitList(text) {
  return String(text ?? "").split(/[,;]/).map(t => t.trim()).filter(Boolean);
}

/** The traits string with one trait switched on or off (Codex traits keep their book spelling). */
export function toggleTrait(text, trait, on) {
  const list = traitList(text).filter(t => t.toLowerCase() !== trait.toLowerCase());
  if (on) list.push(trait);
  return list.join(", ");
}

/**
 * A weapon's system data with a mode put in (or replaced): its name, the light it gives, and its mode damage.
 * @param {object} sys  The weapon's system data.
 * @param {{mode:string, formula:string, type:string, light:number}} m  A preset from ARNEYAN.weaponModes or the GM's own.
 */
export function withMode(sys, m) {
  const others = (sys.bonusDamage ?? []).filter(b => !b.mode);
  return {
    toggle: true, active: false, modeLabel: m.mode || "On", modeLight: Number(m.light) || 0,
    bonusDamage: [...others, ...(m.formula ? [{ formula: m.formula, type: m.type ?? "", when: "", mode: true }] : [])]
  };
}

/** Item data for the forged version. */
export function forgedData(base, { name, magic = 0, traits = null, rider = null, mode = null } = {}) {
  const data = base.toObject();
  delete data._id;
  delete data.folder;
  delete data.sort;
  data.name = name || base.name;
  data.system.magic = Number(magic) || 0;
  if (traits) data.system.traits = traits;
  if (base.type === "weapon") {
    if (/\bfinesse\b/i.test(data.system.traits ?? "") && data.system.ability === "str") data.system.ability = "finesse";
    if (rider?.formula) data.system.bonusDamage = [...(data.system.bonusDamage ?? []), { formula: rider.formula, type: rider.type ?? "", when: rider.when ?? "", mode: false }];
    if (mode) Object.assign(data.system, withMode(data.system, mode));
  }
  foundry.utils.setProperty(data, "flags.arneyan.forgedFrom", base.uuid);
  foundry.utils.setProperty(data, "_stats.compendiumSource", base._stats?.compendiumSource ?? (base.pack ? base.uuid : null));
  return data;
}

function suggestedName(base, magic, riderType, material = "", modeName = "") {
  const plus = (magic > 0 ? `+${magic} ` : "") + (modeName ? `${modeName} ` : "") + (material ? `${material} ` : "");
  const of = riderType ? ` of ${ARNEYAN.damageTypes[riderType] ?? riderType}` : "";
  return `${plus}${base.name}${of}`;
}

/** Open the forge for a weapon or armour (on a sheet, in the Items sidebar or in a compendium). */
export async function openForge(base) {
  if (!["weapon", "armour"].includes(base?.type)) return ui.notifications.warn("The forge works on weapons and armour.");
  const weapon = base.type === "weapon";
  const owner = base.actor;
  const canWorld = game.user.can?.("ITEM_CREATE") ?? game.user.isGM;
  if (!(owner?.isOwner) && !canWorld) return ui.notifications.warn("Forge from an item on your character's sheet (you can't make items in the sidebar).");
  const traits = new Set(traitList(base.system.traits).map(t => t.toLowerCase()));
  const traitBoxes = weapon ? Object.entries(ARNEYAN.weaponTraits).map(([k, t]) =>
    `<label class="arn-check" data-tooltip="${esc(t.text)}"><input type="checkbox" name="trait" value="${esc(k)}" ${traits.has(k.toLowerCase()) ? "checked" : ""}> ${esc(k)}</label>`).join("") : "";
  const material = Object.keys(ARNEYAN.weaponMaterials).find(m => traits.has(m.toLowerCase())) ?? "";
  const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? "selected" : ""}>${esc(l)}</option>`;
  const content = `<div class="arn-forge">
    <p class="arn-forge-head"><img src="${esc(base.img)}" alt=""> <span>From <strong>${esc(base.name)}</strong>${weapon ? ` · ${esc(base.system.damage)} ${esc(base.system.damageType)}` : ` · AC +${esc(base.system.ac)}`}</span></p>
    <div class="arn-forge-grid">
      <label>Name <input type="text" name="name" value="${esc(base.name)}" placeholder="${esc(base.name)}"></label>
      <label>Magic bonus <select name="magic">${[0, 1, 2, 3].map(n => opt(n, n ? `+${n}` : "None", n === (base.system.magic || 1))).join("")}</select></label>
      ${weapon ? `<label>Extra damage <span class="arn-forge-rider">
        <select name="riderDice">${DICE.map(d => opt(d, d || "None", false)).join("")}</select>
        <select name="riderType">${Object.entries(ARNEYAN.damageTypes).filter(([k]) => k !== "healing").map(([k, l]) => opt(k, l, k === "fire")).join("")}</select></span></label>
      <label>Only when <input type="text" name="riderWhen" placeholder="against undead (blank: every hit)"></label>
      <label data-tooltip="Switched on and off from the Actions tab (Flame Tongue's blade ignites): its damage counts on every hit while on">Mode <select name="mode">${opt("", "None", true)}${Object.entries(ARNEYAN.weaponModes).map(([k, m]) => opt(k, `${m.label}: +${m.formula} ${ARNEYAN.damageTypes[m.type]} while ${m.mode.toLowerCase()}${m.light ? `, light ${m.light}ft` : ""}`, false)).join("")}${opt("custom", "Custom", false)}</select></label>
      <label class="arn-forge-custom" data-tooltip="Filled in from the ready-made mode: change any of it">Mode details <span class="arn-forge-rider"><input type="text" name="modeName" placeholder="Name: Ignited"><input class="short" type="text" name="modeDice" value="1d6" placeholder="1d6" data-tooltip="Damage while on (blank: none)">
        <select name="modeType">${Object.entries(ARNEYAN.damageTypes).filter(([k]) => k !== "healing").map(([k, l]) => opt(k, l, k === "fire")).join("")}</select><input class="short" type="number" name="modeLight" min="0" value="0" data-tooltip="Light while on (ft)"></span></label>
      <label>Made of <select name="material">${opt("", "Ordinary", !material)}${Object.keys(ARNEYAN.weaponMaterials).map(m => opt(m, m, m === material)).join("")}</select></label>` : ""}
    </div>
    ${weapon ? `<fieldset class="arn-forge-traits"><legend>Traits (from the Codex)</legend>${traitBoxes}</fieldset>` : ""}
    <p class="arn-muted">A +N adds to attack and damage rolls${weapon ? "" : " (AC for armour)"} and counts as magic against non-magical Resistance. You can change anything afterwards on the item's sheet.</p>
  </div>`;
  const choice = await DialogV2.wait({
    window: { title: `Forge: ${base.name}`, icon: "fa-solid fa-hammer" }, classes: ["arneyan", "arn-forge-app"], position: { width: 520 }, content,
    // Picking a mode fills in its details (name, damage, type, light), which stay editable.
    render: (event, dialog) => {
      const el = dialog.element ?? dialog;
      const sel = el.querySelector("select[name=mode]");
      const row = el.querySelector(".arn-forge-custom");
      const f = n => el.querySelector(`[name=${n}]`);
      const sync = fill => {
        if (row) row.hidden = !sel?.value;
        const m = ARNEYAN.weaponModes[sel?.value];
        if (fill && m) { f("modeName").value = m.mode; f("modeDice").value = m.formula; f("modeType").value = m.type; f("modeLight").value = m.light ?? 0; }
      };
      sel?.addEventListener("change", () => sync(true));
      sync(false);
    },
    buttons: [
      ...(owner?.isOwner ? [{ action: "actor", label: `Give to ${owner.name}`, icon: "fa-solid fa-user", default: true, callback: (e, b) => read(b.form, "actor") }] : []),
      ...(canWorld ? [{ action: "world", label: "Put in the Items sidebar", icon: "fa-solid fa-box", default: !owner, callback: (e, b) => read(b.form, "world") }] : []),
      { action: "cancel", label: "Cancel" }
    ],
    rejectClose: false
  });
  if (!choice || typeof choice !== "object") return;

  function read(form, where) {
    const el = form.elements;
    const magic = Number(el.magic.value) || 0;
    const rider = weapon && el.riderDice.value ? { formula: el.riderDice.value, type: el.riderType.value, when: el.riderWhen.value.trim() } : null;
    let tr = base.system.traits ?? "";
    if (weapon) {
      const picked = new Set([...form.querySelectorAll("input[name=trait]:checked")].map(i => i.value));
      for (const k of Object.keys(ARNEYAN.weaponTraits)) tr = toggleTrait(tr, k, picked.has(k));
      for (const m of Object.keys(ARNEYAN.weaponMaterials)) tr = toggleTrait(tr, m, el.material.value === m);
    }
    // A ready-made mode is a starting point: what's in the details fields is what the weapon gets.
    let mode = null;
    if (weapon && el.mode.value) mode = { mode: el.modeName.value.trim() || ARNEYAN.weaponModes[el.mode.value]?.mode || "On",
      formula: el.modeDice.value.trim(), type: el.modeType.value, light: Number(el.modeLight.value) || 0 };
    const typed = el.name.value.trim();
    const modeName = weapon && el.mode.value && el.mode.value !== "custom" ? ARNEYAN.weaponModes[el.mode.value].label : "";
    const name = typed && typed !== base.name ? typed : suggestedName(base, magic, rider && !rider.when ? rider.type : "", weapon && el.material.value !== material ? el.material.value : "", modeName);
    return { where, name, magic, traits: tr, rider, mode };
  }

  const data = forgedData(base, choice);
  let made;
  if (choice.where === "actor" && owner) {
    [made] = await owner.createEmbeddedDocuments("Item", [data]);
  } else {
    const canFolder = Folder.implementation?.canUserCreate?.(game.user) ?? game.user.isGM;
    const folder = game.folders.find(f => f.type === "Item" && f.name === FOLDER)
      ?? (canFolder ? await Folder.create({ name: FOLDER, type: "Item", color: "#5a3a1a" }).catch(() => null) : null);
    data.folder = folder?.id ?? null;
    made = await Item.create(data);
  }
  if (made) {
    ui.notifications.info(`Forged ${made.name}.`);
    made.sheet?.render(true);
  }
  return made;
}

/**
 * Foundry v13 and v14 side by side, without v14's deprecation warnings.
 */

/** v14's forced-deletion operator, when there is one. */
const forced = () => globalThis.foundry?.data?.operators?.ForcedDeletion ?? null;

/**
 * An update entry that removes a value: `{ ...unset("flags.arneyan.before") }`.
 * v14: `{ "flags.arneyan.before": ForcedDeletion }`; v13: `{ "flags.arneyan.-=before": null }`.
 */
export function unset(path) {
  const FD = forced();
  if (FD) return { [path]: new FD() };
  const i = path.lastIndexOf(".");
  return i < 0 ? { [`-=${path}`]: null } : { [`${path.slice(0, i)}.-=${path.slice(i + 1)}`]: null };
}

/** The same for a key inside a nested update object: `{ arneyan: { ...unsetKey("before") } }`. */
export function unsetKey(key) {
  const FD = forced();
  return FD ? { [key]: new FD() } : { [`-=${key}`]: null };
}

/** A plain data property of an object, never a getter (v14 puts warning getters where v13's fields were). */
export function own(o, key) {
  if (!o || typeof o !== "object") return undefined;
  const d = Object.getOwnPropertyDescriptor(o, key);
  return d && "value" in d ? d.value : undefined;
}

/** The kinds of wall that block senses: v14 EDGE_SENSE_TYPES, v13 WALL_SENSE_TYPES. */
export const senseTypes = () => globalThis.CONST?.EDGE_SENSE_TYPES ?? globalThis.CONST?.WALL_SENSE_TYPES ?? {};

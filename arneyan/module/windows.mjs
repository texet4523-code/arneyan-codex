/**
 * Every pop-up window can be resized (Kieran, 17 Nov: "Wouldn't all windows being adjustable ... fix this problem").
 * The system's own windows already are; dialogs (Foundry's DialogV2: choices, confirmations, the Select checklist,
 * and the same kind of window from Foundry and modules) aren't by default. This makes a dialog resizable unless it
 * says it mustn't be, and its contents scroll (gmtools.css) so a small window never cuts off its buttons.
 */

/** The class the layout rules use: Foundry puts a resize handle on a resizable window but no class of its own. */
export const RESIZABLE = "arn-resizable";

/**
 * A dialog's window options with resizing on, unless the caller or the dialog's own class chose (`chosen`: a
 * DialogV2 subclass whose defaults say). A resizable dialog gets the RESIZABLE class. Pure, for tests.
 */
export function resizableWindow(passed = {}, merged = {}, chosen = false) {
  const set = passed?.window?.resizable !== undefined || chosen;
  const on = set ? !!merged.window?.resizable : true;
  if (!on) return merged;
  const classes = [...new Set([...(merged.classes ?? []), RESIZABLE])];
  return { ...merged, window: { ...(merged.window ?? {}), resizable: true }, classes };
}

/** Whether a dialog class below DialogV2 sets `window.resizable` in its own defaults (a module's choice). */
function classChose(cls, DialogV2) {
  for (let c = cls; c && c !== DialogV2; c = Object.getPrototypeOf(c)) {
    if (Object.hasOwn(c, "DEFAULT_OPTIONS") && c.DEFAULT_OPTIONS?.window?.resizable !== undefined) return true;
  }
  return false;
}

export function registerWindows() {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2?.prototype?._initializeApplicationOptions || DialogV2.prototype._arneyanResizable) return;
  const original = DialogV2.prototype._initializeApplicationOptions;
  DialogV2.prototype._initializeApplicationOptions = function (options) {
    const merged = original.call(this, options);
    try {
      const out = resizableWindow(options, merged, classChose(this.constructor, DialogV2));
      if (out !== merged) { merged.window = out.window; merged.classes = out.classes; }
    } catch (err) {
      console.warn("Arneyan | resizable dialogs", err);
    }
    return merged;
  };
  DialogV2.prototype._arneyanResizable = true;
}

/**
 * Every pop-up window can be resized (Kieran, 17 Nov: "Wouldn't all windows being adjustable ... fix this problem").
 * The system's own windows already are; dialogs (Foundry's DialogV2: choices, confirmations, the Select checklist,
 * and the same kind of window from Foundry and modules) aren't by default. This makes a dialog resizable unless it
 * says it mustn't be, and its contents scroll (gmtools.css) so a small window never cuts off its buttons.
 */

/** A dialog's window options with resizing on, unless the caller chose otherwise. Pure, for tests. */
export function resizableWindow(passed = {}, merged = {}) {
  if (passed?.window?.resizable !== undefined) return merged;
  return { ...merged, window: { ...(merged.window ?? {}), resizable: true } };
}

export function registerWindows() {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2?.prototype?._initializeApplicationOptions || DialogV2.prototype._arneyanResizable) return;
  const original = DialogV2.prototype._initializeApplicationOptions;
  DialogV2.prototype._initializeApplicationOptions = function (options) {
    const merged = original.call(this, options);
    try {
      const out = resizableWindow(options, merged);
      if (out !== merged) merged.window = out.window;
    } catch (err) {
      console.warn("Arneyan | resizable dialogs", err);
    }
    return merged;
  };
  DialogV2.prototype._arneyanResizable = true;
}

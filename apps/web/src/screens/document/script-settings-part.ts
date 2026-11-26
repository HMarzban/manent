// The mark of Script settings in the Details tab, apart from Script settings, which loads apart, so the command that
// focuses it does not load it.

/** The attribute on Script settings, whose first control the Script settings command focuses. */
export const SCRIPT_SETTINGS_PART = "data-script-settings";

let openPending = false;
const openListeners = new Set<() => void>();

/** Signals Script settings to expand when `doc.scriptSettings` runs, whether already mounted or lazy-loading. */
export function requestScriptSettingsOpen(): void {
  if (openListeners.size > 0) {
    openPending = false;
    for (const listener of openListeners) listener();
    return;
  }
  openPending = true;
}

/** True while a `doc.scriptSettings` open request is waiting for the lazy chunk to mount. */
export function hasPendingScriptSettingsOpen(): boolean {
  return openPending;
}

/** Clears and returns any pending open request once Script settings has mounted. */
export function consumeScriptSettingsOpen(): boolean {
  if (!openPending) return false;
  openPending = false;
  return true;
}

/** Subscribes a mounted Script settings disclosure to future `doc.scriptSettings` open requests. */
export function subscribeScriptSettingsOpen(listener: () => void): () => void {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}

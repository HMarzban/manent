// The mark of Checks in the Details tab, apart from ChecksSection so the command that opens it stays light.

/** The attribute on the Checks disclosure, whose controls `checks.open` expands and focuses. */
export const CHECKS_PART = "data-checks-section";

let openPending = false;
const openListeners = new Set<() => void>();

/** Signals Checks to expand when `checks.open` runs, whether already mounted or mounting on tab switch. */
export function requestChecksOpen(): void {
  if (openListeners.size > 0) {
    openPending = false;
    for (const listener of openListeners) listener();
    return;
  }
  openPending = true;
}

/** True while a `checks.open` request is waiting for ChecksSection to mount. */
export function hasPendingChecksOpen(): boolean {
  return openPending;
}

/** Clears and returns any pending open request once ChecksSection has mounted. */
export function consumeChecksOpen(): boolean {
  if (!openPending) return false;
  openPending = false;
  return true;
}

/** Subscribes a mounted Checks disclosure to future `checks.open` requests. */
export function subscribeChecksOpen(listener: () => void): () => void {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}

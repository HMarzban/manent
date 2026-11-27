// The appearance writes the boot script replays before the first paint, kept in this tab's storage
// and mirrored to localStorage so a cold PWA launch with empty sessionStorage still hydrates without flash.
import type { BootWrite } from "@manent/ui";
import type { TabStorage } from "../session.ts";

export const BOOT_KEY = "manent.boot";

function safeLocalStorage(): TabStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Keeps `writes` for the next load of this tab (and mirrors to `fallback` / `localStorage` for cold PWA launch). */
export function writeBootCache(
  storage: TabStorage | null,
  writes: readonly BootWrite[],
  fallback?: TabStorage | null,
): void {
  const serialized = JSON.stringify(writes);
  try {
    storage?.setItem(BOOT_KEY, serialized);
  } catch {
    // a full or refused storage: the next load starts in the system's appearance, then the app writes the root
  }
  const mirror = fallback !== undefined ? fallback : safeLocalStorage();
  if (mirror !== null && mirror !== storage) {
    try {
      mirror.setItem(BOOT_KEY, serialized);
    } catch {
      // mirror is best effort
    }
  }
}

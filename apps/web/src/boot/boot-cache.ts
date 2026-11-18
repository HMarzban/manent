// The appearance writes the boot script replays before the first paint, kept in this tab's storage.
import type { BootWrite } from "@manent/ui";
import type { TabStorage } from "../session.ts";

export const BOOT_KEY = "manent.boot";

/** Keeps `writes` for the next load of this tab; storage that is missing or refuses leaves the next load in the system's appearance. */
export function writeBootCache(
  storage: TabStorage | null,
  writes: readonly BootWrite[],
): void {
  try {
    storage?.setItem(BOOT_KEY, JSON.stringify(writes));
  } catch {
    // a full or refused storage: the next load starts in the system's appearance, then the app writes the root
  }
}

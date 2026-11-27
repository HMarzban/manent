// The appearance writes the boot script replays before the first paint, kept in this tab's storage
// and mirrored to localStorage so a cold PWA launch with empty sessionStorage still hydrates without flash.
import { STUDIO_PALETTE_IDS } from "@manent/settings";
import type { StudioPaletteId } from "@manent/settings";
import type { BootWrite } from "@manent/ui";
import type { TabStorage } from "../session.ts";

export const BOOT_KEY = "manent.boot";
const KEPT_GEMS_KEY = "manent.gems.kept.v1";
const GEM_SOUND_KEY = "manent.gems.sound.v1";
const VALID_GEMS: ReadonlySet<string> = new Set(STUDIO_PALETTE_IDS);

function safeLocalStorage(): TabStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Private, device-local list of studio palettes whose Collector Vitrine the writer has opened. */
export function readKeptGems(): readonly StudioPaletteId[] {
  const storage = safeLocalStorage();
  if (storage === null) return [];
  try {
    const raw = storage.getItem(KEPT_GEMS_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const unique: StudioPaletteId[] = [];
    for (const item of parsed) {
      if (
        typeof item === "string" &&
        VALID_GEMS.has(item) &&
        !unique.includes(item as StudioPaletteId)
      ) {
        unique.push(item as StudioPaletteId);
      }
    }
    return unique;
  } catch {
    return [];
  }
}

/** Records `palette` in the private device-local collector list and returns the updated list. */
export function recordKeptGem(
  palette: StudioPaletteId,
): readonly StudioPaletteId[] {
  const current = readKeptGems();
  if (current.includes(palette)) return current;
  const next = [...current, palette];
  try {
    safeLocalStorage()?.setItem(KEPT_GEMS_KEY, JSON.stringify(next));
  } catch {
    // storage refused: keep for this visit
  }
  return next;
}

/** Private device-local opt-in toggle for Collector Vitrine Web Audio foley (false / muted by default). */
export function readGemSound(): boolean {
  try {
    return safeLocalStorage()?.getItem(GEM_SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeGemSound(enabled: boolean): void {
  try {
    safeLocalStorage()?.setItem(GEM_SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // storage refused
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

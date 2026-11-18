// Every setting of this release, declared once, and the closed list of preferences.
import { APPEARANCE_SETTINGS } from "./definitions/appearance.ts";
import { DEVICE_SETTINGS } from "./definitions/device.ts";
import { POINTERS } from "./definitions/pointers.ts";
import { SCRIPT_SETTINGS } from "./definitions/script.ts";
import { WRITING_SETTINGS } from "./definitions/writing.ts";
import { createRegistry } from "./registry.ts";
import type { SettingKey } from "./store.ts";

/** Keys an earlier release declared, which are never declared again; empty in this release. */
export const RETIRED_KEYS: readonly string[] = Object.freeze([]);

export const SETTINGS = createRegistry(
  Object.freeze([
    ...WRITING_SETTINGS,
    ...APPEARANCE_SETTINGS,
    ...DEVICE_SETTINGS,
    ...SCRIPT_SETTINGS,
  ] as const),
  RETIRED_KEYS,
  POINTERS,
);

/**
 * The nine preferences, in the order of the Preferences panes; the list is closed, so a tenth fails the tests
 * until it is added here. `keyboard.shortcuts` is the map of keys, not a registry entry.
 */
export const PREFERENCE_LIST: readonly (SettingKey | "keyboard.shortcuts")[] =
  Object.freeze([
    "writing.enterAfterDialogue",
    "writing.typewriterScrolling",
    "writing.checkSpelling",
    "writing.showCursors",
    "writing.announce",
    "appearance.theme",
    "appearance.whitePage",
    "keyboard.shortcuts",
    "device.interfaceSize",
  ]);

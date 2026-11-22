// What the desktop app's page says: a script whose first sync was refused, and This device's rows.

import { formatCount } from "./format.ts";

export const DESKTOP_WORDS = {
  /** `reason` is one of `handoffReason`. */
  handoffRefused: (title: string, reason: string): string =>
    `Couldn't sync '${title}': ${reason}. It stays on this device only.`,
  /** Why the server refused a script's first sync, by the code it answered. */
  handoffReason: {
    forbidden: "you can't add scripts to this workspace",
    deleted: "it was deleted on the server",
    exists_elsewhere:
      "the server already holds a different script with its identity",
    invalid: "Manent couldn't read part of it",
    too_large: "Manent couldn't read part of it",
  },
  scriptsRow: "Scripts",
  folderRow: "Folder",
  channelRow: "Channel",
  /** The size `PREFERENCES_WORDS.scriptsStored` names: whole megabytes, never less than 1. */
  storedSize: (bytes: number): string =>
    `${formatCount(Math.max(1, Math.round(bytes / 1_000_000)))} MB`,
} as const;

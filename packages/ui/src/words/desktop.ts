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
  fileTypesRow: "File types",
  fileTypesValue: ".fdx, .fountain, .ink, .docx",
  connectionGroup: "Connection",
  connectionOnline: "Online · Syncing with the server",
  connectionOffline: "Offline · Saved on this device",
  connectionNote:
    "Every change saves on this device first and syncs when the server is online.",
  checkConnection: "Check connection",
  checkingConnection: "Checking…",
  copyPath: "Copy path",
  copiedPath: "Copied",
  updatesSchedule: "Checks when Manent starts and every 6 hours.",
  aboutTitle: "About Manent",
  versionRow: "Version",
  layoutEngineRow: "Layout engine",
  systemRow: "System",
  systemMac: "macOS",
  systemWindows: "Windows",
  systemLinux: "Linux",
  copyVersionInfo: "Copy details",
  aboutVersionInfo: (
    version: string,
    channel: string,
    engine: number,
    system: string,
  ): string =>
    `Manent ${version} (${channel}) · Layout engine ${engine} · ${system}`,
  /** The custom desktop window titlebar and its platform caption controls. */
  windowTitlebar: "Window title bar",
  minimizeWindow: "Minimise window",
  maximizeWindow: "Maximise window",
  restoreWindow: "Restore window",
  closeWindow: "Close window",
  appMenu: "Menu",
  commandPalette: "Commands",
  offlineBadge: "Offline · Saved on this device",
  offlineShort: "Offline",
  restartToUpdate: "Restart to update",
  deviceVaultTitle: "This device",
  deviceVaultBody: "Saved on this device · syncs when online",
  openDataFolder: "Open folder",
  openInBrowser: "Open in browser",
  /** The size `PREFERENCES_WORDS.scriptsStored` names: whole megabytes, never less than 1. */
  storedSize: (bytes: number): string =>
    `${formatCount(Math.max(1, Math.round(bytes / 1_000_000)))} MB`,
} as const;

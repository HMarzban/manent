// The words of Preferences: its panes, search, Set by you, This device, About and the shortcut editor.

import { formatCount } from "./format.ts";

export const PREFERENCES_WORDS = {
  title: "Preferences",
  writing: "Writing",
  appearance: "Appearance",
  keyboard: "Keyboard",
  account: "Account",
  /** The pane of this device's own preferences: in the desktop app, and in a browser. */
  device: (desktop: boolean): string =>
    desktop ? "This device" : "This browser",
  search: "Search…",
  setByYouLabel: "Set by you",
  setByYouCount: (n: number): string => `Set by you · ${formatCount(n)}`,
  yoursLine: "Yours. These follow you to every device and affect no one else.",
  keyboardLine:
    "Yours. These follow you to every device and affect no one else. ⌘ is Ctrl on Windows and Linux.",
  /** Where this device's preferences are kept; `where` names the app or browser, null when it is not known. */
  deviceLine: (desktop: boolean, where: string | null): string => {
    const place = desktop
      ? "Kept on this device only"
      : "Kept in this browser only";
    return where === null ? `${place}.` : `${place} — ${where}.`;
  },
  /** A preference that differs from its default; `from` names the device it was set on, null for this one. */
  setByYou: (
    date: string,
    defaultLabel: string,
    from: string | null,
  ): string =>
    from === null
      ? `Set by you ${date} · Default: ${defaultLabel}`
      : `Set by you ${date} · Default: ${defaultLabel}, from ${from}`,
  defaultIs: (label: string): string => `Default: ${label}`,
  reset: "Reset",
  resetAll: "Reset all preferences",
  resetShortcuts: "Reset shortcuts",
  preferencesGroup: "Preferences",
  shortcutsGroup: "Shortcuts",
  allDefault: "Everything is at its default.",
  resultsCount: (n: number): string =>
    n === 1 ? "1 preference" : `${formatCount(n)} preferences`,
  noMatch: (q: string): string => `No preference matches "${q}".`,
  elsewhere: "Elsewhere",
  searchAllCommands: (q: string): string => `Search all commands for "${q}"`,
  notSavedHere: "Not saved on this device",
  systemNow: (label: string): string => `System (now ${label})`,
  contrastNote:
    "Your system's contrast colours are in use. This applies when they are off.",
  accountSaved: (state: "synced" | "waiting"): string =>
    state === "synced"
      ? "Saved on this device · Synced to your account"
      : "Saved on this device · Waiting to sync",
  accountNotSignedIn:
    "Not signed in. Your preferences are kept on this device.",
  signIn: "Sign in to sync",
  switchPerson: "Switch person",
  fromSystem: "From your system",
  motion: "Motion",
  motionFull: "Full",
  motionReduced: "Reduced",
  contrast: "Contrast",
  contrastStandard: "Standard",
  contrastMore: "More",
  contrastForced: "Your system's contrast colours",
  changeInSystem: "Change these in your system.",
  storedHere: "Stored here",
  browserMayClear: "Kept in this browser. It may clear Manent's data.",
  askToKeep: "Ask the browser to keep it",
  browserKeeps: "Kept in this browser. The browser has agreed to keep it.",
  /** How many scripts this device stores, and their size as formatted ("23 MB"). */
  scriptsStored: (n: number, size: string): string =>
    n === 1 ? `1 script · ${size}` : `${formatCount(n)} scripts · ${size}`,
  showInLibrary: "Show in Library",
  showFolder: "Show folder",
  exportEverything: "Export everything on this device…",
  /** Progressive label while "Export everything on this device…" writes each project archive. */
  exportingProjects: (n: number): string =>
    n === 1 ? "Exporting 1 project…" : `Exporting ${formatCount(n)} projects…`,
  /** Brief message once "Export everything on this device…" has written every project archive into `folder`. */
  exportedProjects: (n: number, folder: string): string =>
    n === 1
      ? `Exported 1 project to '${folder}'.`
      : `Exported ${formatCount(n)} projects to '${folder}'.`,
  exportEverythingRefused: "Couldn't export everything. Try again.",
  about: "About",
  /** The app's own number; "Version" is a point in a script's history only. */
  version: (v: string): string => `Manent ${v}`,
  unversioned: "Manent — demo",
  channelStable: "Stable",
  channelCanary: "Canary",
  layoutEngine: (n: number): string => `Layout engine ${n}`,
  checkForUpdates: "Check for updates",
  checkingForUpdates: "Checking for updates…",
  upToDate: "Manent is up to date.",
  updateReady: "Update ready — installs the next time Manent starts",
  updateCheckFailed: "Couldn't check for updates. Try again later.",
  noUsageData: "Manent sends no usage data.",
  aiPledge:
    "Manent has no features that write for you, and your scripts are never used to train AI.",
  readAiPledge: "Read the AI pledge",
  aiPledgeFull:
    "Manent has no features that write for you: it generates no scenes, lines, summaries or suggestions. Your scripts are never used to train AI, by Manent or by anyone Manent works with.",
  findByKeys: "Find by pressing keys",
  capture: "Press the new shortcut. Esc cancels, Delete removes it.",
  noShortcut: "No shortcut",
  fixedFlow: "Fixed. The Enter and Tab flow is the same for everyone.",
  fixedPicker: "Fixed. The element picker's keys are the same for everyone.",
  fixedClipboard: "Fixed. Copy, cut, paste and undo use your system's keys.",
  voiceOverNote:
    "VoiceOver uses Control-Option for its own commands, so this may not reach Manent while VoiceOver is on.",
  /** A chord already held by `holder` while the command `_wanting` asks for it; the sentence names the holder only, and the buttons useItFor and keep name each side. */
  clash: (keys: string, holder: string, _wanting: string): string =>
    `${keys} is ${holder}.`,
  useItFor: (label: string): string => `Use it for ${label}`,
  keep: (label: string): string => `Keep ${label}`,
  /** A chord the browser usually takes; `effect` comes from the reserved keys ("usually opens a new tab"). */
  warn: (keys: string, effect: string): string =>
    `${keys} ${effect} in this browser and may never reach Manent.`,
  useAnyway: "Use anyway",
  chooseAnother: "Choose another",
  leaves: (keys: string, effect: string): string =>
    `${keys} ${effect} in the browser. Not offered on the web, because a missed key would leave your script.`,
  typesCharacter: (keys: string, char: string): string =>
    `${keys} types ${char} on this keyboard. Add ⌘.`,
  mayNotWork: (keys: string, effect: string): string =>
    `May not work here: ${keys} ${effect} in this browser.`,
  /** The way to an element that always works ("⌥↵ then 1"). */
  alwaysWorksElement: (path: string): string => `${path} always works.`,
  alwaysWorksCommand: (keys: string): string =>
    `${keys}, then its name, always works.`,
} as const;

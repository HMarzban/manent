// Preferences and settings.
import type { Term } from "./index.ts";
import { row } from "./row.ts";

export const PREFERENCE_TERMS: readonly Term[] = Object.freeze([
  ...row("writing", ["Preference"], [], ["setting", "option", "config"]),
  ...row("writing", ["Preferences"], ["settings", "options"]),
  ...row("writing", ["Yours"], ["global", "account-wide"]),
  ...row("writing", ["This device", "This browser"], ["machine"]),
  ...row("writing", ["Script settings"], ["page preferences"]),
  ...row("formats", ["Project settings"], ["show template", "show style"]),
  ...row("workspaces", ["Workspace settings"], []),
  ...row("workspaces", ["Notifications"], ["alerts"]),
  ...row("writing", ["Set by you", "Set by Sam"], ["modified", "customised"]),
  ...row("writing", ["Default", "Reset"], ["factory", "revert"]),
  ...row("workspaces", ["Edit", "Update"], []),
  ...row("workspaces", ["AI pledge"], []),
  ...row("writing", ["System"], ["auto"]),
  ...row("writing", ["Theme"], [], ["night mode"]),
  ...row("writing", ["Shortcut"], ["hotkey", "keybinding"]),
  ...row("writing", ["Motion", "Contrast"], []),
  ...row("writing", ["Channel"], ["track", "beta"]),
  ...row("writing", ["Fixed"], []),
  ...row("formats", ["Element style"], ["stylesheet"]),
  ...row("formats", ["Target length"], ["page budget"]),
  ...row("formats", ["Act structure"], ["act template"]),
  ...row("formats", ["Drama", "Single-camera", "Custom"], []),
  ...row("formats", ["17 Nov 2026", "Nov 17, 2026", "2026-11-17"], []),
]);

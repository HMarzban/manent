// Words for Workspace settings -> API keys.

export const API_KEYS_WORDS = Object.freeze({
  intro:
    "A key lets a program read this workspace's folders and scripts. It can't change anything.",
  createKey: "Create key",
  nameLabel: "Name",
  namePlaceholder: "What it is for, such as Line data for the engine",
  needsNameReason: "needs a name",
  createNeedsName: "Create key needs a name.",
  shownOnce: "Copy this key now: it is never shown again.",
  newKeyLabel: (name: string): string => `New key for '${name}'`,
  copy: "Copy",
  copied: "Copied",
  pressToCopy: (mac: boolean): string =>
    mac
      ? "Press ⌘C to copy the selected key."
      : "Press Ctrl+C to copy the selected key.",
  columns: Object.freeze({
    name: "Name",
    created: "Created",
    lastUsed: "Last used",
  }),
  neverUsed: "Never used",
  revokedAt: (when: string): string => `Revoked ${when}`,
  revoke: "Revoke",
  revokeWarning: (name: string): string =>
    `Programs using '${name}' stop reading this workspace at once, and the key can't be used again.`,
  cancel: "Cancel",
  revokeNamed: (name: string): string => `Revoke '${name}'`,
  revokedMessage: (name: string): string => `Revoked '${name}'.`,
  couldNotCreate: "Couldn't create the key. Try again.",
  couldNotRevoke: (name: string): string =>
    `Couldn't revoke '${name}'. Try again.`,
});

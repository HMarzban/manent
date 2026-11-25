// Words for Workspace settings and people.

export const WORKSPACE_WORDS = Object.freeze({
  title: "Workspace settings",
  windowTitle: (group: string): string => `Workspace settings — ${group}`,
  backToLibrary: "‹ Library",
  scope: "Rules for everyone in this workspace.",
  groups: Object.freeze({
    people: "People",
    notifications: "Notifications",
    api_keys: "API keys",
  }),
  nothingSetUp: "Nothing is set up",
  needsConnection: "Changing these needs a connection.",
  ownersOnly: "Only owners can change workspace settings.",
  couldNotLoadCached: (group: string): string =>
    `Couldn't load ${group}. Showing what this device last saw.`,
  couldNotLoad: (group: string): string => `Couldn't load ${group}.`,
  tryAgain: "Try again",
  peopleScope: (workspace: string): string =>
    `Roles here apply to every project in ${workspace}, except where someone was given a script directly.`,
  roleChanged: (person: string, workspace: string, role: string): string =>
    `${person}'s role in ${workspace} is now ${role}.`,
  yourRoleChanged: (by: string, workspace: string, role: string): string =>
    `${by} changed your role in ${workspace} to ${role}.`,
  couldNotChangeRole: (person: string): string =>
    `Couldn't change ${person}'s role. Try again.`,
  needsAnOwner: (person: string, workspace: string): string =>
    `Couldn't change ${person}'s role: ${workspace} needs an owner. Make someone else an owner first.`,
  canAlso: "Can also",
  canAlsoSendToPrompter: "Send to prompter",
  canAlsoEditRundowns: "Edit rundowns",
  canAlsoIssueAndLock: "Issue revisions and lock page numbers",
  canAlsoDelete: "Delete",
  canAlsoPhraseSendToPrompter: "send to prompter",
  canAlsoPhraseEditRundowns: "edit rundowns",
  canAlsoPhraseIssueAndLockGrant: "issue revisions and lock page numbers",
  canAlsoPhraseIssueAndLockRevoke: "issue revisions or lock page numbers",
  canAlsoPhraseDelete: "delete",
  canAlsoGroupLabel: (name: string): string => `What ${name} can also do`,
  canAlsoReadOnly:
    "Only the project's owner and people who can issue revisions change these.",
  canAlsoGranted: (person: string, phrase: string, project: string): string =>
    `${person} can also ${phrase} in ${project}.`,
  canAlsoRevoked: (person: string, phrase: string, project: string): string =>
    `${person} can no longer ${phrase} in ${project}.`,
  canAlsoRefused: (person: string): string =>
    `Couldn't change what ${person} can also do. Try again.`,
  canNoLongerIssue: (revision: string, project: string): string =>
    `Couldn't issue ${revision}: you can no longer issue revisions in ${project}.`,
  canNoLongerDelete: (title: string, project: string): string =>
    `Couldn't move '${title}' to Trash: you can no longer delete in ${project}.`,
  undo: "Undo",
});

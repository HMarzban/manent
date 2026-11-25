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
});

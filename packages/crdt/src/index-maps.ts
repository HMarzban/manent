// The root maps of the two kinds of index document. Append only: a name is stored in every index.

/** The maps of a person's private index. */
export const PRIVATE_INDEX_MAPS = Object.freeze([
  "prefs",
  "keys",
  "flags",
  "continue",
  "review",
  "on_device",
] as const);

/** The maps of a workspace's index. */
export const WORKSPACE_INDEX_MAPS = Object.freeze([
  "projects",
  "documents",
] as const);

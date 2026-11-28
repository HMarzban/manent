// The root maps of the three kinds of index document and of a script's comments document. Append only: a name is
// stored in every such document.

/** The maps of a person's private index. */
export const PRIVATE_INDEX_MAPS = Object.freeze([
  "prefs",
  "keys",
  "flags",
  "continue",
  "review",
  "on_device",
  "tour",
  "writing",
  "private_copies",
  "last_read",
  "rundown_columns",
  "favourites",
  "private_folder",
  "goals",
] as const);

/** The maps of a workspace's index. */
export const WORKSPACE_INDEX_MAPS = Object.freeze([
  "projects",
  "documents",
  "folders",
  "templates",
] as const);

/** The maps of a project's index. */
export const PROJECT_INDEX_MAPS = Object.freeze([
  "template",
  "style",
  "seasons",
  "episodes",
  "names",
  "facts",
  "groups",
  "board",
  "ladder",
  "source",
  "can_also",
  "settings_meta",
] as const);

/** The maps of a script's comments document. */
export const COMMENTS_DOC_MAPS = Object.freeze([
  "threads",
  "items",
  "rounds",
  "flags",
] as const);

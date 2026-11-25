// The closed lists a setting is placed by: Preferences panes, menus, and Script and Project settings groups.

/** The Preferences panes, in order. */
export const SECTION_IDS = [
  "writing",
  "appearance",
  "keyboard",
  "account",
  "device",
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const MENU_IDS = [
  "app",
  "file",
  "edit",
  "view",
  "format",
  "script",
  "production",
  "window",
  "help",
  "title",
  "person",
] as const;
export type MenuId = (typeof MENU_IDS)[number];

/** The Script settings groups, in order; a group with no row is not drawn. */
export const SCRIPT_GROUPS = [
  "page_setup",
  "mores",
  "scene_numbers",
  "revisions",
  "header_footer",
  "layout_engine",
] as const;
export type ScriptGroup = (typeof SCRIPT_GROUPS)[number];

/** The Project settings groups, in order. */
export const PROJECT_GROUPS = [
  "format_style",
  "names_facts",
  "people",
  "drafts",
] as const;
export type ProjectGroup = (typeof PROJECT_GROUPS)[number];

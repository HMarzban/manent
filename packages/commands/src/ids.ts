// The closed lists of screens, panels, panel tabs and surfaces that commands open and run in.

export const SCREEN_IDS = [
  "library",
  "document",
  "preferences",
  "choose",
  "send",
] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

export const PANEL_IDS = ["left", "side"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export const SIDE_TABS = ["history", "details", "tour"] as const;
export type SideTab = (typeof SIDE_TABS)[number];

export const LEFT_TABS = ["scenes"] as const;
export type LeftTab = (typeof LEFT_TABS)[number];

export const SURFACE_IDS = [
  "library",
  "document",
  "preferences",
  "choose",
  "left_panel",
  "side_panel",
  "palette",
  "sync_centre",
  "workspace_switcher",
  "new_project",
  "title_menu",
  "view_menu",
  "person_menu",
  "consequence_dialog",
  "inline_rename",
  "shortcut_capture",
  "send",
  "version_view",
  "name_field",
] as const;
export type SurfaceId = (typeof SURFACE_IDS)[number];

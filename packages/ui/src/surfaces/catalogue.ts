// Every surface of the interface once: its kind, the commands that open it, and where focus goes when it opens and closes.
import { COMMANDS, SURFACE_IDS } from "@manent/commands";
import type { CommandId, SurfaceId } from "@manent/commands";

export type FocusIntent = "first" | "item" | "stay";

export interface SurfaceEntry {
  id: SurfaceId;
  kind: "screen" | "panel" | "popover" | "dialog" | "bar_field";
  /** In the order of `COMMANDS`. */
  openedBy: readonly CommandId[];
  /** A command's own `opens.focus` overrides this. */
  focusOnOpen:
    "heading" | "search" | "first" | "item" | "stay" | "cancel" | "caret";
  focusOnClose: "opener" | "caret" | "previous_place";
}

type Row = Omit<SurfaceEntry, "id" | "openedBy">;

const screen = (focusOnOpen: Row["focusOnOpen"]): Row => ({
  kind: "screen",
  focusOnOpen,
  focusOnClose: "previous_place",
});
// a panel shown by a bare toggle leaves focus in the page; a command that uses the panel moves focus into it
const PANEL: Row = {
  kind: "panel",
  focusOnOpen: "stay",
  focusOnClose: "caret",
};
// opened by key, a menu highlights its current or first item
const MENU: Row = {
  kind: "popover",
  focusOnOpen: "item",
  focusOnClose: "opener",
};
const POPOVER: Row = {
  kind: "popover",
  focusOnOpen: "first",
  focusOnClose: "opener",
};
// anchored at the caret, it never takes focus from the page
const CARET_POPOVER: Row = {
  kind: "popover",
  focusOnOpen: "stay",
  focusOnClose: "caret",
};
const DIALOG: Row = {
  kind: "dialog",
  focusOnOpen: "first",
  focusOnClose: "opener",
};

const ROWS: Readonly<Record<SurfaceId, Row>> = {
  library: screen("heading"),
  // the page takes focus at the caret, so the first keystroke lands on it
  document: screen("caret"),
  preferences: screen("search"),
  choose: screen("heading"),
  left_panel: PANEL,
  side_panel: PANEL,
  palette: { kind: "popover", focusOnOpen: "search", focusOnClose: "opener" },
  sync_centre: POPOVER,
  workspace_switcher: MENU,
  new_project: POPOVER,
  title_menu: MENU,
  view_menu: MENU,
  person_menu: MENU,
  consequence_dialog: {
    kind: "dialog",
    focusOnOpen: "cancel",
    focusOnClose: "opener",
  },
  inline_rename: {
    kind: "bar_field",
    focusOnOpen: "item",
    focusOnClose: "opener",
  },
  shortcut_capture: {
    kind: "bar_field",
    focusOnOpen: "first",
    focusOnClose: "opener",
  },
  send: screen("heading"),
  version_view: { kind: "screen", focusOnOpen: "first", focusOnClose: "caret" },
  name_field: {
    kind: "bar_field",
    focusOnOpen: "item",
    focusOnClose: "previous_place",
  },
  // the system's own file picker, drawn by no page
  file_picker: { kind: "dialog", focusOnOpen: "stay", focusOnClose: "opener" },
  selection_toolbar: CARET_POPOVER,
  comment_popover: POPOVER,
  alternates_popover: POPOVER,
  pitch_field: {
    kind: "bar_field",
    focusOnOpen: "first",
    focusOnClose: "opener",
  },
  people_list: MENU,
  share_dialog: DIALOG,
  beside: PANEL,
  project_settings: screen("heading"),
  present: screen("heading"),
  reader: screen("heading"),
  name_offer: CARET_POPOVER,
  flag_picker: MENU,
  board: screen("heading"),
  rundown_grid: {
    kind: "screen",
    focusOnOpen: "item",
    focusOnClose: "previous_place",
  },
  cell_popover: POPOVER,
  prompter_files: DIALOG,
  workspace_settings: screen("heading"),
  save_template_dialog: DIALOG,
};

const openersOf = (id: SurfaceId): readonly CommandId[] =>
  COMMANDS.flatMap((command) =>
    command.opens?.surface === id ? [command.id] : [],
  );

/** One row per surface id, in the order of `SURFACE_IDS`; the focus tests are generated from it. */
export const SURFACES: readonly SurfaceEntry[] = Object.freeze(
  SURFACE_IDS.map((id): SurfaceEntry =>
    Object.freeze({ id, ...ROWS[id], openedBy: openersOf(id) }),
  ),
);

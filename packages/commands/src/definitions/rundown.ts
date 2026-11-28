// The commands of a rundown: rows, reordering, copying, opening a story beside, importing, cell history, columns and starting one.
import type { Chord, PlatformKeys } from "../chord.ts";
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition, MenuPlacement } from "../define.ts";
import { isWorkspaceWritable, workspaceReason } from "./library.ts";

interface Need {
  holds(ctx: CommandContext): boolean;
  reason(ctx: CommandContext): string;
}

const SCRIPT_ROW_SELECTED: Need = {
  holds: (ctx) => ctx.rundown?.scriptRowSelected === true,
  reason: () => "needs a script row selected",
};

const CAN_MOVE_UP: Need = {
  holds: (ctx) => ctx.rundown?.canMoveUp !== false,
  reason: () => "isn't available on the first row",
};

const CAN_MOVE_DOWN: Need = {
  holds: (ctx) => ctx.rundown?.canMoveDown !== false,
  reason: () => "isn't available on the last row",
};

const HAS_CLIPBOARD: Need = {
  holds: (ctx) => ctx.rundown?.hasClipboard !== false,
  reason: () => "needs rows copied from a rundown",
};

const HAS_PREVIOUS_VALUE: Need = {
  holds: (ctx) => ctx.rundown?.hasPreviousValue !== false,
  reason: () => "needs a cell with a previous value",
};

const WORKSPACE_WRITABLE: Need = {
  holds: isWorkspaceWritable,
  reason: workspaceReason,
};

const same = (...keys: Chord[]): PlatformKeys =>
  Object.freeze({ mac: keys, windows: keys, linux: keys });

const NO_KEYS = same();

const onRundown = (ctx: CommandContext): boolean => ctx.rundown !== null;
const canEditRundown = (ctx: CommandContext): boolean =>
  ctx.rundown !== null && ctx.rundown.canEdit;
const isRundownDoc = (ctx: CommandContext): boolean =>
  ctx.docOpen && ctx.docKind === "rundown";
const forNewRundown = (ctx: CommandContext): boolean =>
  ctx.screen === "library" ||
  ctx.projectKind === "show" ||
  ctx.projectKind === "news";

const editingCell = (ctx: CommandContext): boolean =>
  ctx.rundown?.editingCell === true;

/** A rundown command, scoped to `surface:rundown_grid` and requiring edit access unless narrowed or broadened. */
function rundownCommand<const Id extends string>(
  id: Id,
  label: string,
  more: {
    group?: CommandDefinition["group"];
    scope?: CommandDefinition["scope"];
    keys?: PlatformKeys;
    visible?: (ctx: CommandContext) => boolean;
    need?: Need;
    passThrough?: (ctx: CommandContext) => boolean;
    menus?: readonly MenuPlacement[];
    palette?: CommandDefinition["palette"];
    opens?: CommandDefinition["opens"];
  } = {},
): CommandDefinition<Id> & { readonly label: string } {
  return {
    id,
    label,
    group: more.group ?? more.menus?.[0]?.menu ?? "script",
    home: null,
    scope: more.scope ?? "surface:rundown_grid",
    keys: more.keys ?? NO_KEYS,
    keysFixed: false,
    when: more.need?.holds ?? null,
    whyNot: more.need?.reason ?? null,
    visible: more.visible ?? canEditRundown,
    checked: null,
    passThrough: more.passThrough ?? null,
    menus: more.menus ?? [],
    palette: more.palette ?? { keywords: [] },
    opens: more.opens ?? null,
    reach: "self",
    setting: null,
  };
}

export const RUNDOWN_COMMANDS = defineCommands([
  rundownCommand("rundown.addRow", "Add row", {
    palette: { keywords: ["rundown", "row"] },
  }),
  rundownCommand("rundown.addHeaderRow", "Add header row", {
    palette: { keywords: ["rundown", "header", "section"] },
  }),
  rundownCommand("rundown.deleteRows", "Delete", {
    keys: same("Delete"),
    passThrough: editingCell,
    palette: { keywords: ["rundown", "remove", "row"] },
  }),
  rundownCommand("rundown.moveUp", "Move up", {
    keys: same("Alt+ArrowUp"),
    need: CAN_MOVE_UP,
    passThrough: editingCell,
    palette: { keywords: ["rundown", "reorder", "row"] },
  }),
  rundownCommand("rundown.moveDown", "Move down", {
    keys: same("Alt+ArrowDown"),
    need: CAN_MOVE_DOWN,
    passThrough: editingCell,
    palette: { keywords: ["rundown", "reorder", "row"] },
  }),
  rundownCommand("rundown.copyRows", "Copy", {
    visible: onRundown,
    palette: { keywords: ["rundown", "row"] },
  }),
  rundownCommand("rundown.pasteRows", "Paste", {
    need: HAS_CLIPBOARD,
    palette: { keywords: ["rundown", "row"] },
  }),
  rundownCommand("rundown.openBeside", "Open beside", {
    keys: same("Mod+Enter"),
    visible: onRundown,
    need: SCRIPT_ROW_SELECTED,
    opens: { surface: "beside", focus: "first" },
    palette: { keywords: ["rundown", "story", "script"] },
  }),
  rundownCommand("rundown.importRows", "Import rows from script", {
    need: SCRIPT_ROW_SELECTED,
    palette: { keywords: ["rundown", "slug", "split"] },
  }),
  rundownCommand("rundown.splitBySlug", "Split into rows by slug", {
    palette: {
      hidden: "a message action after a script is dropped on a rundown",
    },
  }),
  rundownCommand("rundown.startScript", "Start a script", {
    palette: { keywords: ["rundown", "story", "segment"] },
  }),
  rundownCommand("rundown.previousValue", "Previous value", {
    visible: onRundown,
    need: HAS_PREVIOUS_VALUE,
    opens: { surface: "cell_popover", focus: "first" },
    palette: { keywords: ["rundown", "cell", "history"] },
  }),
  rundownCommand("rundown.restorePrevious", "Restore", {
    palette: { keywords: ["rundown", "previous", "cell"] },
  }),
  rundownCommand("rundown.columns", "Columns", {
    scope: "global",
    visible: isRundownDoc,
    menus: [{ menu: "view", group: "rundown", order: 10, submenu: null }],
    opens: { surface: "view_menu", focus: "item" },
    palette: { keywords: ["rundown", "hide", "show"] },
  }),
  rundownCommand("rundown.new", "New rundown", {
    group: "file",
    scope: "global",
    visible: forNewRundown,
    need: WORKSPACE_WRITABLE,
    palette: { keywords: ["rundown", "show", "news"] },
  }),
  rundownCommand("rundown.leaveUnnumbered", "Leave unnumbered", {
    palette: { keywords: ["rundown", "row", "number"] },
  }),
  rundownCommand("rundown.numberRow", "Number this row", {
    palette: { keywords: ["rundown", "row", "number"] },
  }),
]);

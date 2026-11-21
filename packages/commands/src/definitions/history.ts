// The commands of version history: marking and naming versions, comparing, viewing, restoring and who wrote what.
import type { Keys, PlatformKeys } from "../chord.ts";
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition, MenuPlacement } from "../define.ts";

const onDocument = (ctx: CommandContext): boolean => ctx.docOpen;
// a person who can only view or comment sees the History tab read-only
const canEdit = (ctx: CommandContext): boolean =>
  ctx.docOpen && (ctx.role === "owner" || ctx.role === "editor");

const same = (...keys: Keys): PlatformKeys => ({
  mac: keys,
  windows: keys,
  linux: keys,
});
const placed = (
  menu: MenuPlacement["menu"],
  group: string,
  order: number,
): MenuPlacement => ({ menu, group, order, submenu: null });

/** A command shown on an open document, unless `visible` narrows who sees it. */
function historyCommand<const Id extends string>(
  id: Id,
  label: string,
  more: {
    visible?: (ctx: CommandContext) => boolean;
    keys?: PlatformKeys;
    menus?: readonly MenuPlacement[];
    palette?: CommandDefinition["palette"];
    opens?: CommandDefinition["opens"];
  } = {},
): CommandDefinition<Id> & { readonly label: string } {
  return {
    id,
    label,
    // listed with the menu it sits in first, else with File
    group: more.menus?.[0]?.menu ?? "file",
    home: null,
    scope: "global",
    keys: more.keys ?? same(),
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: more.visible ?? onDocument,
    checked: null,
    passThrough: null,
    menus: more.menus ?? [],
    palette: more.palette ?? { keywords: [] },
    opens: more.opens ?? null,
    reach: "self",
    setting: null,
  };
}

export const HISTORY_COMMANDS = defineCommands([
  historyCommand("history.markVersion", "Mark a version", {
    visible: canEdit,
    keys: same("Mod+S"),
    menus: [placed("file", "history", 20)],
    palette: { keywords: ["snapshot", "backup"] },
  }),
  historyCommand("history.nameDraft", "Name this draft…", {
    visible: canEdit,
    keys: same("Mod+Shift+S"),
    menus: [placed("file", "history", 30), placed("title", "drafts", 10)],
    opens: { surface: "name_field", focus: "item" },
  }),
  historyCommand("history.changesSince", "Changes since", {
    palette: { keywords: ["compare", "diff", "what's new"] },
  }),
  historyCommand("history.hideChanges", "Hide"),
  historyCommand("history.showSinceOpened", "Show", {
    palette: { hidden: "the state bar's action" },
  }),
  historyCommand("history.backToWorking", "Back to Working"),
  historyCommand("history.nextChange", "Next change"),
  historyCommand("history.previousChange", "Previous change"),
  historyCommand("history.restore", "Restore", {
    visible: canEdit,
    palette: { keywords: ["revert", "roll back"] },
  }),
  historyCommand("history.restoreScene", "Restore this scene", {
    visible: canEdit,
  }),
  historyCommand("history.restoreBefore", "Restore 'Before restore'", {
    visible: canEdit,
  }),
  historyCommand("history.seeWhatChanged", "See what changed"),
  {
    ...historyCommand("history.whoWrote", "Who wrote this?", {
      menus: [placed("script", "who", 10)],
    }),
    when: (ctx: CommandContext) => ctx.online,
    whyNot: () => "needs a connection",
  },
]);

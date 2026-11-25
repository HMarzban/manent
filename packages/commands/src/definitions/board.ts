// The Board's commands: adding storylines and cards, linking a card to a scene, and moving the focused card.
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition } from "../define.ts";
import { isWorkspaceWritable, workspaceReason } from "./library.ts";

const canEditBoard = (ctx: CommandContext): boolean =>
  isWorkspaceWritable(ctx) && ctx.role !== "viewer" && ctx.role !== "commenter";

const boardEditReason = (ctx: CommandContext): string =>
  !isWorkspaceWritable(ctx)
    ? workspaceReason(ctx)
    : ctx.role === "viewer" || ctx.role === "commenter"
      ? "needs edit access to this board"
      : "";

const boardCommand = <const Id extends string>(
  id: Id,
  label: string,
  keys: readonly string[],
  keywords: readonly string[],
): CommandDefinition<Id> & { readonly label: string } => ({
  id,
  label,
  group: "script",
  home: null,
  scope: "surface:board",
  keys: { mac: keys, windows: keys, linux: keys },
  keysFixed: false,
  when: canEditBoard,
  whyNot: boardEditReason,
  visible: (ctx) => ctx.screen === "board",
  checked: null,
  passThrough: null,
  menus: [],
  palette: { keywords },
  opens: null,
  reach: "self",
  setting: null,
});

export const BOARD_COMMANDS = defineCommands([
  boardCommand("board.addStoryline", "Add storyline", [], ["storyline", "row"]),
  boardCommand("board.addCard", "Add card", [], ["card", "beat"]),
  boardCommand("board.linkScene", "Link to scene", [], ["scene", "link"]),
  boardCommand(
    "board.moveCardUp",
    "Move card up",
    ["Alt+ArrowUp"],
    ["move", "card", "up"],
  ),
  boardCommand(
    "board.moveCardDown",
    "Move card down",
    ["Alt+ArrowDown"],
    ["move", "card", "down"],
  ),
]);

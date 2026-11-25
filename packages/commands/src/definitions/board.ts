// The Board's commands: adding storylines and cards, linking a card to a scene, and moving the focused card.
import { defineCommands } from "../define.ts";
import type { CommandDefinition } from "../define.ts";

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
  when: null,
  whyNot: null,
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

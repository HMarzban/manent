// Inline graphic and broadcast chyron commands: zero-dialog insertion directly onto the page.
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition } from "../define.ts";

const EMPTY_KEYS = { mac: [], windows: [], linux: [] } as const;

const canInsertImage = (ctx: CommandContext): boolean =>
  ctx.docOpen &&
  (ctx.docKind === null || ctx.docKind === "script") &&
  ctx.format !== "ink" &&
  (ctx.role === "owner" || ctx.role === "editor");

const canInsertChyron = (ctx: CommandContext): boolean =>
  canInsertImage(ctx) &&
  (ctx.projectKind === "show" ||
    ctx.projectKind === "news" ||
    ctx.format === "variety");

function graphicCommand<const Id extends string>(
  id: Id,
  label: string,
  order: number,
  visible: (ctx: CommandContext) => boolean,
  keywords: readonly string[],
): CommandDefinition<Id> & { readonly label: string } {
  return {
    id,
    label,
    group: "format",
    home: null,
    scope: "global",
    keys: EMPTY_KEYS,
    keysFixed: false,
    when: null,
    whyNot: null,
    visible,
    checked: null,
    passThrough: null,
    menus: [{ menu: "format", group: "graphics", order, submenu: null }],
    palette: { keywords },
    opens: null,
    reach: "self",
    setting: null,
  };
}

export const GRAPHICS_COMMANDS = defineCommands([
  graphicCommand("graphics.insertImage", "Insert image", 10, canInsertImage, [
    "graphic",
  ]),
  graphicCommand(
    "graphics.insertLowerThird",
    "Insert lower third",
    20,
    canInsertChyron,
    ["graphic"],
  ),
  graphicCommand(
    "graphics.insertOts",
    "Insert over the shoulder",
    30,
    canInsertChyron,
    ["graphic"],
  ),
  graphicCommand(
    "graphics.insertFullScreen",
    "Insert full screen",
    40,
    canInsertChyron,
    ["graphic"],
  ),
]);

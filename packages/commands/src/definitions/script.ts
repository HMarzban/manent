// Commands on the Script menu for writing tools (Rename character, Read aloud, goals, and names).
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";

const editableScript = (ctx: CommandContext): boolean =>
  ctx.docOpen &&
  ctx.docKind === "script" &&
  ctx.format !== "ink" &&
  (ctx.role === "owner" || ctx.role === "editor");

const whyNotEditableScript = (ctx: CommandContext): string => {
  if (!ctx.docOpen) return "needs a document open";
  if (ctx.docKind !== "script") return "works on a script";
  if (ctx.format === "ink") return "isn't part of the Ink format";
  return "needs edit access";
};

export const SCRIPT_COMMANDS = defineCommands([
  {
    id: "script.renameCharacter",
    label: "Rename character",
    group: "script",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: editableScript,
    whyNot: whyNotEditableScript,
    visible: null,
    checked: null,
    passThrough: null,
    menus: [{ menu: "script", group: "script", order: 10, submenu: null }],
    palette: { keywords: ["character", "cue", "replace"] },
    opens: null,
    reach: "self",
    setting: null,
  },
]);

// Room log commands: linking the caret's line to an episode's scene heading or outline beat, and removing that link.
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";

const NO_KEYS = Object.freeze({ mac: [], windows: [], linux: [] });

const canEditRoomLog = (ctx: CommandContext): boolean =>
  ctx.docOpen &&
  (ctx.role === "owner" || ctx.role === "editor") &&
  (ctx.docKind === "room_log" || ctx.projectKind === "series");

export const ROOM_LOG_COMMANDS = defineCommands([
  {
    id: "roomLog.link",
    label: "Link to beat or scene",
    group: "edit",
    home: null,
    scope: "global",
    keys: NO_KEYS,
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: canEditRoomLog,
    checked: null,
    passThrough: null,
    menus: [],
    palette: { keywords: [] },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "roomLog.unlink",
    label: "Remove link",
    group: "edit",
    home: null,
    scope: "global",
    keys: NO_KEYS,
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: canEditRoomLog,
    checked: null,
    passThrough: null,
    menus: [],
    palette: { keywords: [] },
    opens: null,
    reach: "self",
    setting: null,
  },
]);

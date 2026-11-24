// The commands of the reader frame (`/r/$token`).
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";

const NONE = Object.freeze({ mac: [], windows: [], linux: [] });

export const READER_COMMANDS = defineCommands([
  {
    id: "history.sinceLastRead",
    label: "Changes since you last read",
    group: "file",
    home: null,
    scope: "global",
    keys: NONE,
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx: CommandContext) => ctx.screen === "reader",
    checked: null,
    passThrough: null,
    menus: [],
    palette: { hidden: "reader frame only" },
    opens: null,
    reach: "self",
    setting: null,
  },
]);

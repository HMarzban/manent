// The Library's commands: a new script, or a new project of any kind.
import type { CommandContext } from "../context.ts";
import type { CommandDefinition } from "../define.ts";

const inLibrary = (ctx: CommandContext): boolean => ctx.screen === "library";

export const LIBRARY_COMMANDS = [
  {
    id: "library.newScript",
    label: "New script",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: inLibrary,
    checked: null,
    passThrough: null,
    menus: [{ menu: "file", group: "new", order: 10, submenu: null }],
    palette: { keywords: [] },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "library.newProject",
    label: "New project",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: inLibrary,
    checked: null,
    passThrough: null,
    menus: [{ menu: "file", group: "new", order: 20, submenu: null }],
    palette: { keywords: [] },
    opens: { surface: "new_project", focus: "first" },
    reach: "self",
    setting: null,
  },
] as const satisfies readonly CommandDefinition[];

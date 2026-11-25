// A new script, or a new project of any kind, from any screen.
import type { CommandContext } from "../context.ts";
import type { CommandDefinition } from "../define.ts";

// why the workspace the Library shows takes nothing new now
const NOT_WRITABLE: Readonly<
  Record<Exclude<CommandContext["workspace"], "writable">, string>
> = Object.freeze({
  read_only: "needs edit access to this workspace",
  getting_ready: "needs the workspace to be ready",
});

/** The person can add a project to the workspace the Library shows. */
export const isWorkspaceWritable = (ctx: CommandContext): boolean =>
  ctx.workspace === "writable";

/** The reason clause while `isWorkspaceWritable` is false. */
export const workspaceReason = (ctx: CommandContext): string =>
  ctx.workspace === "writable" ? "" : NOT_WRITABLE[ctx.workspace];

export const LIBRARY_COMMANDS = [
  {
    id: "library.newScript",
    label: "New script",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: isWorkspaceWritable,
    whyNot: workspaceReason,
    visible: null,
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
    when: isWorkspaceWritable,
    whyNot: workspaceReason,
    visible: null,
    checked: null,
    passThrough: null,
    menus: [{ menu: "file", group: "new", order: 20, submenu: null }],
    palette: { keywords: [] },
    opens: { surface: "new_project", focus: "first" },
    reach: "self",
    setting: null,
  },
] as const satisfies readonly CommandDefinition[];

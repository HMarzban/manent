// Undo and Redo, which leave the page's and a field's own history alone, and the reverse a setting's message offers.
import type { CommandContext } from "../context.ts";
import type { CommandDefinition } from "../define.ts";

const ownHistory = (ctx: CommandContext): boolean =>
  ctx.focus === "field" || ctx.focus === "page";

export const EDIT_COMMANDS = [
  {
    id: "edit.undo",
    label: "Undo",
    group: "edit",
    home: null,
    scope: "global",
    keys: { mac: ["Mod+Z"], windows: ["Control+Z"], linux: ["Control+Z"] },
    keysFixed: true,
    when: null,
    whyNot: null,
    visible: null,
    checked: null,
    passThrough: ownHistory,
    menus: [{ menu: "edit", group: "undo", order: 10, submenu: null }],
    palette: { keywords: [] },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "edit.redo",
    label: "Redo",
    group: "edit",
    home: null,
    scope: "global",
    keys: {
      mac: ["Mod+Shift+Z"],
      windows: ["Control+Y", "Control+Shift+Z"],
      linux: ["Control+Y", "Control+Shift+Z"],
    },
    keysFixed: true,
    when: null,
    whyNot: null,
    visible: null,
    checked: null,
    passThrough: ownHistory,
    menus: [{ menu: "edit", group: "undo", order: 20, submenu: null }],
    palette: { keywords: [] },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "settings.undo",
    label: "Undo",
    group: "edit",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: null,
    checked: null,
    passThrough: null,
    menus: [],
    palette: {
      hidden: "the reverse a message offers for a setting or a reset",
    },
    opens: null,
    reach: "self",
    setting: null,
  },
] as const satisfies readonly CommandDefinition[];

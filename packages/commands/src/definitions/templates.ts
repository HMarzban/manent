// Commands for saving reusable Show and News templates from an open script or rundown.
import type { CommandDefinition } from "../define.ts";

export const TEMPLATE_COMMANDS = [
  {
    id: "template.save",
    label: "Save template…",
    group: "title",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) =>
      ctx.docOpen &&
      (ctx.projectKind === "show" || ctx.projectKind === "news") &&
      (ctx.role === "owner" || ctx.role === "editor"),
    checked: null,
    passThrough: null,
    menus: [{ menu: "title", group: "template", order: 40, submenu: null }],
    palette: { keywords: [] },
    opens: { surface: "save_template_dialog", focus: "first" },
    reach: "self",
    setting: null,
  },
] as const satisfies readonly CommandDefinition[];

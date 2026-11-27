// The commands of an open document: its Script settings and its name.
import type { CommandDefinition } from "../define.ts";

export const DOCUMENT_COMMANDS = [
  {
    id: "doc.scriptSettings",
    label: "Script settings",
    group: "title",
    home: "homeScriptSettings",
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) => ctx.docOpen,
    checked: null,
    passThrough: null,
    menus: [
      { menu: "title", group: "settings", order: 10, submenu: null },
      { menu: "format", group: "script_settings", order: 10, submenu: null },
    ],
    palette: { keywords: [] },
    opens: { surface: "side_panel", focus: "first" },
    reach: "self",
    setting: null,
  },
  {
    id: "doc.rename",
    label: "Rename",
    group: "title",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) =>
      ctx.docOpen &&
      ctx.docKind !== "rundown" &&
      (ctx.role === "owner" || ctx.role === "editor"),
    checked: null,
    passThrough: null,
    menus: [{ menu: "title", group: "name", order: 10, submenu: null }],
    palette: { keywords: [] },
    opens: { surface: "inline_rename", focus: "item" },
    reach: "self",
    setting: null,
  },
  {
    id: "doc.linesPerPage",
    label: "Lines per page",
    group: "format",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: (ctx) => ctx.production?.locked !== true,
    whyNot: () => "can't change while page numbers are locked",
    visible: (ctx) =>
      ctx.docOpen &&
      (ctx.docKind === null || ctx.docKind === "script") &&
      ctx.format !== "ink" &&
      (ctx.role === "owner" || ctx.role === "editor"),
    checked: null,
    passThrough: null,
    menus: [],
    palette: { keywords: ["page height", "page length", "lines"] },
    opens: null,
    reach: "others",
    setting: null,
  },
] as const satisfies readonly CommandDefinition[];

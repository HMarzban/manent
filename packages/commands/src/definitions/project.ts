import { defineCommands } from "../define.ts";

export const PROJECT_COMMANDS = defineCommands([
  {
    id: "project.openSettings",
    label: "Project settings",
    group: "title",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: (ctx) => ctx.docOpen,
    whyNot: () => "needs a document open",
    visible: (ctx) => ctx.docOpen,
    checked: null,
    passThrough: null,
    menus: [
      { menu: "title", group: "settings", order: 20, submenu: null },
      { menu: "format", group: "script_settings", order: 30, submenu: null },
    ],
    palette: { keywords: ["project", "settings"] },
    opens: { surface: "project_settings", focus: "heading" },
    reach: "self",
    setting: null,
  },
  {
    id: "project.readRate",
    label: "Read rate",
    group: "format",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) =>
      ctx.docOpen &&
      ctx.projectKind !== null &&
      (ctx.format === "variety" ||
        ctx.projectKind === "show" ||
        ctx.projectKind === "news" ||
        ctx.projectKind === "podcast") &&
      (ctx.role === "owner" || ctx.role === "editor"),
    checked: null,
    passThrough: null,
    menus: [],
    palette: { keywords: ["timing", "speed", "pace", "characters per second"] },
    opens: null,
    reach: "others",
    setting: null,
  },
  {
    id: "project.targetPages",
    label: "Target length",
    group: "format",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) =>
      ctx.docOpen &&
      ctx.projectKind !== null &&
      ctx.format !== "ink" &&
      (ctx.role === "owner" || ctx.role === "editor"),
    checked: null,
    passThrough: null,
    menus: [],
    palette: { keywords: ["target pages", "page target", "episode length"] },
    opens: null,
    reach: "others",
    setting: null,
  },
]);

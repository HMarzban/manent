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
]);

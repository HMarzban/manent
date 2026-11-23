import { defineCommands } from "../define.ts";

export const SHARE_COMMANDS = defineCommands([
  {
    id: "share.open",
    label: "Share…",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: (ctx) => ctx.online,
    whyNot: () => "needs a connection",
    // the Share dialog is drawn on a document's screen
    visible: (ctx) => ctx.screen === "document",
    checked: null,
    passThrough: null,
    menus: [{ menu: "file", group: "share", order: 10, submenu: null }],
    palette: { keywords: [] },
    opens: { surface: "share_dialog", focus: "first" },
    reach: "self",
    setting: null,
  },
]);

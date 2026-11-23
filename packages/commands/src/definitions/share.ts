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
    // no Share dialog answers it yet
    when: () => false,
    whyNot: () => "needs a connection",
    visible: null,
    checked: null,
    passThrough: null,
    menus: [{ menu: "file", group: "share", order: 10, submenu: null }],
    palette: { keywords: [] },
    opens: { surface: "share_dialog", focus: "first" },
    reach: "self",
    setting: null,
  },
]);

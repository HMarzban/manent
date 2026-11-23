// Duplicate: the open script, or the version chosen in History, becomes a separate script.
import { defineCommands } from "../define.ts";

export const COPIES_COMMANDS = defineCommands([
  {
    id: "doc.duplicate",
    label: "Duplicate",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) => ctx.docOpen && ctx.docKind === "script",
    checked: null,
    passThrough: null,
    // after Print… in Title ▾, and after History in File
    menus: [
      { menu: "title", group: "send", order: 40, submenu: null },
      { menu: "file", group: "history", order: 40, submenu: null },
    ],
    palette: { keywords: ["copy"] },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "doc.duplicateVersion",
    label: "Duplicate",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    // a version this device does not hold is read from the server
    when: (ctx) => ctx.online,
    whyNot: () => "needs a connection",
    visible: (ctx) => ctx.docOpen && ctx.docKind === "script",
    checked: null,
    passThrough: null,
    menus: [],
    palette: { hidden: "an item of a version's row in History" },
    opens: null,
    reach: "self",
    setting: null,
  },
]);

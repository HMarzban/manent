import { defineCommands } from "../define.ts";

export const CHECKS_COMMANDS = defineCommands([
  {
    id: "checks.open",
    label: "Checks",
    group: "script",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) => ctx.docOpen && ctx.docKind !== "rundown",
    checked: null,
    passThrough: null,
    menus: [],
    palette: { keywords: ["checks", "preflight", "spelling", "review"] },
    opens: null,
    reach: "self",
    setting: null,
  },
]);

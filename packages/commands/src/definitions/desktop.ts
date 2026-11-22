// The commands only the desktop app offers.
import type { CommandDefinition } from "../define.ts";

export const DESKTOP_COMMANDS = [
  {
    id: "app.openInBrowser",
    label: "Open in browser",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) => ctx.shell === "desktop" && ctx.demo,
    checked: null,
    passThrough: null,
    menus: [{ menu: "file", group: "browser", order: 80, submenu: null }],
    palette: { keywords: [] },
    opens: null,
    reach: "self",
    setting: null,
  },
] as const satisfies readonly CommandDefinition[];

// The demo's own command: the Tour tab of the side panel.
import type { CommandDefinition } from "../define.ts";

export const DEMO_COMMANDS = [
  {
    id: "demo.tour",
    label: "Tour",
    group: "help",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) => ctx.demo,
    checked: null,
    passThrough: null,
    menus: [{ menu: "help", group: "tour", order: 10, submenu: null }],
    palette: { keywords: [] },
    opens: { surface: "side_panel", focus: "stay" },
    reach: "self",
    setting: null,
  },
] as const satisfies readonly CommandDefinition[];

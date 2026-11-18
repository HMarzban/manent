// The panels of the document screen, and History in the side panel.
import type { CommandContext } from "../context.ts";
import type { CommandDefinition } from "../define.ts";

const docOpen = (ctx: CommandContext): boolean => ctx.docOpen;
const needsDocument = (): string => "needs a document open";

export const VIEW_COMMANDS = [
  {
    id: "view.leftPanel",
    label: "Left panel",
    group: "view",
    home: null,
    scope: "global",
    // the candidates off macOS are unconfirmed on real keyboards, so they ship unbound
    keys: { mac: ["Mod+Alt+1"], windows: [], linux: [] },
    keysFixed: false,
    when: docOpen,
    whyNot: needsDocument,
    visible: null,
    checked: (ctx) => ctx.panelOpen.left,
    passThrough: null,
    menus: [{ menu: "view", group: "panels", order: 10, submenu: null }],
    palette: { keywords: [] },
    opens: { surface: "left_panel", focus: "stay" },
    reach: "self",
    setting: null,
  },
  {
    id: "view.sidePanel",
    label: "Side panel",
    group: "view",
    home: null,
    scope: "global",
    keys: { mac: ["Mod+Alt+2"], windows: [], linux: [] },
    keysFixed: false,
    when: docOpen,
    whyNot: needsDocument,
    visible: null,
    checked: (ctx) => ctx.panelOpen.side,
    passThrough: null,
    menus: [{ menu: "view", group: "panels", order: 20, submenu: null }],
    palette: { keywords: [] },
    opens: { surface: "side_panel", focus: "stay" },
    reach: "self",
    setting: null,
  },
  {
    id: "history.open",
    label: "History",
    group: "view",
    home: null,
    scope: "global",
    keys: {
      mac: ["Mod+Shift+H"],
      windows: ["Mod+Shift+H"],
      linux: ["Mod+Shift+H"],
    },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) => ctx.docOpen && ctx.historyPresent,
    checked: null,
    passThrough: null,
    menus: [{ menu: "view", group: "panels", order: 30, submenu: null }],
    palette: { keywords: ["version history", "timeline"] },
    opens: { surface: "side_panel", focus: "first" },
    reach: "self",
    setting: null,
  },
] as const satisfies readonly CommandDefinition[];

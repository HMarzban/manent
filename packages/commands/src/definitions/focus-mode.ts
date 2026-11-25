// Focus mode: hides both panels while keeping the title bar status, state bar and status bar.
import type { CommandDefinition } from "../define.ts";

export const FOCUS_MODE_COMMANDS = [
  {
    id: "view.focusMode",
    label: "Focus mode",
    group: "view",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: (ctx) => ctx.docOpen,
    whyNot: () => "needs a document open",
    visible: null,
    checked: (ctx) => ctx.focusMode,
    passThrough: null,
    menus: [{ menu: "view", group: "panels", order: 40, submenu: null }],
    palette: { keywords: ["distraction", "panels", "hide panels"] },
    opens: null,
    reach: "self",
    setting: null,
  },
] as const satisfies readonly CommandDefinition[];
